#!/usr/bin/env node
// How much sharpprompt adds to a day's token use: its own calls (classify,
// rewrite, forks that finished after losing the race) against the tokens of
// the interactive sessions in the same window. Runs outside the plugin and
// reads local files only.
//
// node scripts/token_overhead.mjs [--from <ISO>] [--to <ISO>] [--store <file>]
//   [--projects <dir>] [--exclude-project <part>]... [--include-headless] [--out <file>]
//
// Plugin side: the store's rewrites (usage as the engine returned it),
// late (forks that lost the race) and classified. The engine's classify
// returns a label and no usage, so classify tokens are an estimate
// (CLASSIFY_* below). Records with no time (written before 0.2.1) are left
// out and counted.
//
// Session side: assistant rows in <projects>/**/*.jsonl, one per API request
// (rows of one response share a requestId), timestamp in the window. Only
// interactive sessions (entrypoint "cli"): `claude -p` runs, the benchmark's
// among them, are "sdk-cli" and left out unless --include-headless.
// The plugin's own calls are not in the transcripts, so nothing is counted twice.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { storeFiles } from './export_log.mjs'

// USD per million tokens, Anthropic API list prices (cached 6 October 2026).
// Cache writes: 1.25x input for 5 minutes, 2x for 1 hour. Where no cache
// read price is listed, 0.1x input.
export const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
const ALIASES = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }

export function priceOf(model) {
  const id = ALIASES[model] ?? model ?? ''
  const hit = PRICES[id] ?? Object.entries(PRICES).find(([k]) => id.startsWith(k))?.[1]
  return { id, known: !!hit, ...(hit ?? PRICES['claude-opus-5-5']) }
}

// Tokens of one call: input (outside the cache), output, cache read, cache
// write for 5 minutes and for 1 hour.
const zero = () => ({ input: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0 })
const add = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, write5m: a.write5m + b.write5m, write1h: a.write1h + b.write1h })
export function dollars(t, model) {
  const p = priceOf(model)
  return (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.write5m * p.input * 1.25 + t.write1h * p.input * 2) / 1e6
}

// The plugin keeps tokens as {input, output, cacheRead, cacheWrite}; its fork
// rides the session's cache, which Claude Code writes for an hour.
const fromStore = u => (u ? { input: u.input ?? 0, output: u.output ?? 0, cacheRead: u.cacheRead ?? 0, write5m: 0, write1h: u.cacheWrite ?? 0 } : zero())

// Classify: one short completion on the helper model. The engine's prompt is
// not visible; these are the numbers the estimate uses.
export const CLASSIFY_OVERHEAD = 250
export const CLASSIFY_PER_WORD = 1.4
export const CLASSIFY_OUTPUT = 8
const classifyTokens = words => ({ ...zero(), input: Math.round(CLASSIFY_OVERHEAD + CLASSIFY_PER_WORD * words), output: CLASSIFY_OUTPUT })

export function pluginSide(stores, from, to) {
  const inWindow = at => typeof at === 'number' && at >= from && at < to
  const out = { byModel: {}, rewrites: 0, classified: 0, late: 0, undated: 0, decisions: {}, classifyEstimate: zero(), classifyModel: 'claude-haiku-5-5', calls: zero() }
  const put = (model, t) => {
    const id = priceOf(model).id
    out.byModel[id] = add(out.byModel[id] ?? zero(), t)
  }
  for (const s of stores) {
    for (const r of s.rewrites ?? []) {
      if (r.at === undefined) {
        out.undated++
        continue
      }
      if (!inWindow(r.at)) continue
      out.rewrites++
      const t = fromStore(r.usage)
      put(r.via === 'complete' ? (r.helper ?? 'haiku') : r.model, t)
      out.calls = add(out.calls, t)
    }
    for (const l of s.late ?? []) {
      if (!inWindow(l.at)) continue
      out.late += l.forks ?? 1
      const t = fromStore(l.usage)
      put(l.model, t)
      out.calls = add(out.calls, t)
    }
    for (const c of s.classified ?? []) {
      if (c.at === undefined) {
        out.undated++
        continue
      }
      if (!inWindow(c.at)) continue
      out.classified++
      const t = classifyTokens(c.words ?? 0)
      out.classifyModel = priceOf(c.model ?? 'haiku').id
      put(c.model ?? 'haiku', t)
      out.classifyEstimate = add(out.classifyEstimate, t)
    }
    for (const d of s.decisions ?? []) if (inWindow(d.at)) out.decisions[d.key] = (out.decisions[d.key] ?? 0) + 1
  }
  return out
}

function jsonlFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...jsonlFiles(p))
    else if (name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

export function sessionSide(projectsDir, from, to, { exclude = [], includeHeadless = false } = {}) {
  // One entry per request; the rows of one response repeat its usage, the
  // last carrying the final output count, so the largest of each field wins.
  const requests = new Map()
  const skipped = { headless: 0, excluded: 0 }
  for (const project of existsSync(projectsDir) ? readdirSync(projectsDir) : []) {
    if (exclude.some(x => project.includes(x))) {
      skipped.excluded++
      continue
    }
    for (const file of jsonlFiles(join(projectsDir, project))) {
      // A file untouched since before the window holds nothing in it.
      if (statSync(file).mtimeMs < from) continue
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.includes('"assistant"') || !line.includes('"usage"')) continue
        let r
        try {
          r = JSON.parse(line)
        } catch {
          continue
        }
        if (r.type !== 'assistant' || !r.message?.usage) continue
        const at = Date.parse(r.timestamp)
        if (!(at >= from && at < to)) continue
        if (r.entrypoint !== 'cli' && !includeHeadless) {
          skipped.headless++
          continue
        }
        const model = r.message.model
        if (!model || model.startsWith('<')) continue
        const u = r.message.usage
        const c = u.cache_creation ?? {}
        const t = {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          write5m: c.ephemeral_5m_input_tokens ?? 0,
          write1h: c.ephemeral_1h_input_tokens ?? (c.ephemeral_5m_input_tokens === undefined ? (u.cache_creation_input_tokens ?? 0) : 0),
        }
        const key = r.requestId ?? r.message.id ?? `${file}:${r.uuid}`
        const prev = requests.get(key)
        requests.set(key, prev ? { model, t: Object.fromEntries(Object.keys(t).map(k => [k, Math.max(prev.t[k], t[k])])) } : { model, t })
      }
    }
  }
  const byModel = {}
  for (const { model, t } of requests.values()) {
    const id = priceOf(model).id
    byModel[id] = add(byModel[id] ?? zero(), t)
  }
  return { byModel, requests: requests.size, skipped }
}

const total = byModel => Object.values(byModel).reduce(add, zero())
const cost = byModel => Object.entries(byModel).reduce((a, [m, t]) => a + dollars(t, m), 0)
const n = x => Math.round(x).toLocaleString('en-US')
const pctOf = (a, b) => (b ? `${((100 * a) / b).toFixed(2)}%` : '-')

export function report(plugin, session, from, to) {
  const P = total(plugin.byModel)
  const S = total(session.byModel)
  const kinds = [
    ['input (outside the cache)', 'input'],
    ['output', 'output'],
    ['cache read', 'cacheRead'],
    ['cache write', null],
  ]
  const get = (t, k) => (k ? t[k] : t.write5m + t.write1h)
  const pc = cost(plugin.byModel)
  const sc = cost(session.byModel)
  const d = plugin.decisions
  const seen = Object.values(d).reduce((a, b) => a + b, 0)
  const gate = Object.entries(d).filter(([k]) => k.startsWith('skip:')).reduce((a, [, v]) => a + v, 0)
  const unknown = [...new Set([...Object.keys(plugin.byModel), ...Object.keys(session.byModel)].filter(m => !priceOf(m).known))]
  const out = [
    `# sharpprompt token overhead`,
    '',
    `Window ${new Date(from).toISOString()} to ${new Date(to).toISOString()}.`,
    '',
    '| tokens | sharpprompt | sessions | sharpprompt / sessions |',
    '|---|---|---|---|',
    ...kinds.map(([label, k]) => `| ${label} | ${n(get(P, k))} | ${n(get(S, k))} | ${pctOf(get(P, k), get(S, k))} |`),
    `| API price, USD | ${pc.toFixed(4)} | ${sc.toFixed(4)} | ${pctOf(pc, sc)} |`,
    '',
    `Prompts typed: ${seen}; passed by the gate ${gate}; classified ${plugin.classified}; rewrites ${plugin.rewrites}; forks finished after losing the race ${plugin.late}.`,
    seen ? `Per typed prompt: ${n((P.input + P.output + P.cacheRead + P.write5m + P.write1h) / seen)} tokens, ${(pc / seen).toFixed(5)} USD.` : 'Per typed prompt: no prompts in the window.',
    plugin.rewrites ? `Per rewrite: ${n((plugin.calls.input + plugin.calls.output + plugin.calls.cacheRead + plugin.calls.write5m + plugin.calls.write1h) / plugin.rewrites)} tokens in the rewrite calls, of which cache read ${pctOf(plugin.calls.cacheRead, plugin.calls.input + plugin.calls.cacheRead + plugin.calls.write5m + plugin.calls.write1h)} of the input side.` : 'Per rewrite: no rewrites in the window.',
    `Sessions: ${session.requests} API requests in interactive sessions; ${session.skipped.headless} rows from \`claude -p\` runs and ${session.skipped.excluded} excluded project folders left out.`,
    '',
    'Notes:',
    `- The fork rereads the whole conversation from the prompt cache, so its cache read count is large; at the cache read price it costs about a tenth of the same input outside the cache, which is why the USD line is the one to read.`,
    `- Classify tokens are an estimate (${CLASSIFY_OVERHEAD} + ${CLASSIFY_PER_WORD} per word in, ${CLASSIFY_OUTPUT} out, on ${plugin.classifyModel}): the engine's classify returns no usage. They are ${n(get(plugin.classifyEstimate, 'input'))} in and ${n(plugin.classifyEstimate.output)} out here, ${dollars(plugin.classifyEstimate, plugin.classifyModel).toFixed(4)} USD.`,
    plugin.undated ? `- ${plugin.undated} plugin records have no time (written before timestamps were kept) and are left out.` : null,
    unknown.length ? `- No price listed for ${unknown.join(', ')}; priced as Opus 5.5.` : null,
    `- On a Max plan the usage limit is not a token count; this is what the same use would cost on the API, not a share of the plan's limit.`,
  ]
  return out.filter(l => l !== null).join('\n')
}

function main(args) {
  const opt = name => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const all = name => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []))
  const to = opt('to') ? Date.parse(opt('to')) : Date.now()
  const from = opt('from') ? Date.parse(opt('from')) : to - 24 * 3600 * 1000
  if (!(from < to)) {
    console.error('--from must be before --to')
    process.exit(1)
  }
  const files = opt('store') ? [opt('store')] : storeFiles()
  const stores = files.map(f => JSON.parse(readFileSync(f, 'utf8')))
  const projects = opt('projects') ?? join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
  const md = report(pluginSide(stores, from, to), sessionSide(projects, from, to, { exclude: all('exclude-project'), includeHeadless: args.includes('--include-headless') }), from, to)
  if (opt('out')) writeFileSync(opt('out'), md + '\n')
  console.log(md)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
