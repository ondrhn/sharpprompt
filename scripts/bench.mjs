#!/usr/bin/env node
// Benchmark: does a sharpprompt rewrite make Claude's work easier than the
// rough prompt it came from? See docs/bench/README.md.
//
// node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs <command> [options]
//
//   rewrites   write docs/bench/rewrites/<id>.txt for every case, with the
//              plugin's own fallback template (no conversation to fork here)
//   run        run every case twice, as typed and rewritten, on a fresh copy
//              of the fixture each time; writes docs/bench/runs/<date>-<model>.jsonl
//              and a manifest beside it
//
// Options: --model <id> (run: required; the model the benchmark runs on)
//          --helper <model> (rewrites: default haiku)
//          --family <fable|opus|sonnet|haiku|common> (rewrites: the rule family
//            of the benchmark model; default fable)
//          --only <id,id,...>   --repeat <n> (run: default 1)
//
//   summary <runs.jsonl>   paired differences (rewritten minus raw) over the
//              cases whose rewrite is not KEEP, medians and a bootstrap 95%
//              interval (1,000 resamples, fixed seed)

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const bench = join(root, 'docs/bench')
const { completePrompt, clean } = await import(join(root, 'hooks/rewrite.ts'))
const { endsWithQuestion } = await import(join(root, 'hooks/gate.ts'))

const args = process.argv.slice(2)
const command = args[0]
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i > 0 && args[i + 1] ? args[i + 1] : fallback
}

function loadCases() {
  const all = readFileSync(join(bench, 'cases.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const only = opt('only', '')
  return only ? all.filter(c => only.split(',').includes(c.id)) : all
}

// One headless completion, no tools, in an empty folder so no project
// instructions are picked up.
function complete(model, prompt) {
  const dir = mkdtempSync(join(tmpdir(), 'sharpprompt-rw-'))
  try {
    const r = spawnSync('claude', ['-p', '--model', model, '--tools', '', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'], {
      cwd: dir,
      input: prompt,
      encoding: 'utf8',
      timeout: 120_000,
    })
    if (r.status !== 0) return { error: (r.stderr || r.stdout || '').slice(0, 300) }
    const out = JSON.parse(r.stdout)
    return { text: out.result ?? '', ms: out.duration_ms, usage: out.usage }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function rewrites() {
  const helper = opt('helper', 'haiku')
  const family = opt('family', 'fable')
  const index = []
  for (const c of loadCases()) {
    const prompt = completePrompt(c.raw, family, c.context)
    const r = complete(helper, prompt)
    let outcome
    let text
    if (r.error) {
      outcome = 'error'
      text = c.raw
    } else {
      const cl = clean(r.text, c.raw)
      outcome = 'rewritten' in cl ? 'rewritten' : cl.rejected
      // What the plugin would send: the rewrite, or the prompt as typed.
      text = 'rewritten' in cl ? cl.rewritten : c.raw
    }
    writeFileSync(join(bench, 'rewrites', `${c.id}.txt`), text + '\n')
    index.push({ id: c.id, outcome, helper, family, ms: r.ms ?? null, words: [c.raw.split(/\s+/).length, text.split(/\s+/).length] })
    console.log(`${c.id}: ${outcome}${r.ms ? ` in ${r.ms} ms` : ''}`)
  }
  const file = join(bench, 'rewrites', 'index.jsonl')
  const kept = (() => {
    try {
      return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    } catch {
      return []
    }
  })().filter(x => !index.some(y => y.id === x.id))
  writeFileSync(file, [...kept, ...index].map(x => JSON.stringify(x)).join('\n') + '\n')
}

// The child runs must save their transcripts (--resume needs them), which a
// session started from inside Claude Code would not.
function childEnv() {
  const env = { ...process.env }
  delete env.CLAUDE_CODE_CHILD_SESSION
  delete env.CLAUDECODE
  return env
}

const CLAUDE_ARGS = model => [
  '-p',
  '--model', model,
  '--setting-sources', '',
  '--permission-mode', 'acceptEdits',
  // Running the project's own tests and scripts, nothing else.
  '--allowedTools', 'Bash(python3 *)',
]

function contextMessage(context) {
  const lines = context.map(m => `${m.role === 'user' ? 'Me' : 'You'}: ${m.text}`)
  return `For context, this is what we said earlier in this conversation. No action needed; just reply "ok".\n\n${lines.join('\n\n')}`
}

const ASKS = /\b(which|do you mean|did you mean|could you clarify|can you clarify|clarify|would you like|do you want|should i|want me to)\b/i

function parseStream(stdout) {
  let tools = 0
  let result = null
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      tools += ev.message.content.filter(b => b.type === 'tool_use').length
    }
    if (ev.type === 'result') result = ev
  }
  return { tools, result }
}

function runOne(c, arm, model, order, repeat) {
  const text = arm === 'raw' ? c.raw : readFileSync(join(bench, 'rewrites', `${c.id}.txt`), 'utf8').trim()
  const base = mkdtempSync(join(tmpdir(), 'sharpprompt-bench-'))
  const dir = join(base, 'expenses')
  cpSync(join(bench, 'fixture'), dir, { recursive: true })
  const session = randomUUID()
  const env = childEnv()
  const out = { id: c.id, shape: c.shape, arm, order, repeat, session, model }

  try {
    if (c.context.length > 0) {
      const r = spawnSync('claude', [...CLAUDE_ARGS(model), '--session-id', session, '--output-format', 'json'], {
        cwd: dir, env, input: contextMessage(c.context), encoding: 'utf8', timeout: 300_000,
      })
      const j = r.status === 0 ? JSON.parse(r.stdout) : null
      out.context = j
        ? { ms: j.duration_ms, cost: j.total_cost_usd, reply: (j.result ?? '').slice(0, 80), usage: j.usage }
        : { error: (r.stderr || r.stdout || '').slice(0, 300) }
    }
    const t0 = Date.now()
    const r = spawnSync(
      'claude',
      [...CLAUDE_ARGS(model), c.context.length > 0 ? '--resume' : '--session-id', session, '--output-format', 'stream-json', '--verbose'],
      { cwd: dir, env, input: text, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 },
    )
    const { tools, result } = parseStream(r.stdout ?? '')
    const answer = result?.result ?? ''
    Object.assign(out, {
      ok: r.status === 0 && !!result && !result.is_error,
      wallMs: Date.now() - t0,
      ms: result?.duration_ms ?? null,
      turns: result?.num_turns ?? null,
      tools,
      outputTokens: result?.usage?.output_tokens ?? null,
      cost: result?.total_cost_usd ?? null,
      asked: endsWithQuestion(answer),
      asksPattern: ASKS.test(answer.split('\n').slice(-4).join(' ')),
      answer: answer.slice(0, 4000),
    })
    if (!out.ok) out.error = (r.stderr || '').slice(0, 500)
    if (c.check) {
      const k = spawnSync('python3', [join(bench, 'checks', c.check)], {
        cwd: dir, env: { ...process.env, PYTHONPATH: join(bench, 'checks') }, encoding: 'utf8', timeout: 60_000,
      })
      out.check = { name: c.check, pass: k.status === 0, out: (k.stdout + k.stderr).trim().slice(-200) }
    }
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
  return out
}

function run() {
  const model = opt('model', '')
  if (!model) {
    console.error('run needs --model <id>, the model the benchmark runs on')
    process.exit(1)
  }
  const repeat = Number(opt('repeat', '1'))
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim()
  const date = new Date().toISOString().slice(0, 10)
  const runs = join(bench, 'runs')
  mkdirSync(runs, { recursive: true })
  const stem = join(runs, `${date}-${model}${opt('only', '') ? '-partial' : ''}`)
  const file = `${stem}.jsonl`
  const manifest = `${stem}.manifest.jsonl`
  // A second start picks up where the first stopped: an id + arm + repeat in
  // the manifest is done.
  const done = new Set(
    existsSync(manifest)
      ? readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean).map(l => {
          const m = JSON.parse(l)
          return `${m.id}|${m.arm}|${m.repeat}`
        })
      : [],
  )
  for (let rep = 1; rep <= repeat; rep++) {
    for (const c of loadCases()) {
      const arms = Math.random() < 0.5 ? ['raw', 'rewritten'] : ['rewritten', 'raw']
      arms.forEach((arm, i) => {
        if (done.has(`${c.id}|${arm}|${rep}`)) return
        const r = runOne(c, arm, model, i + 1, rep)
        // A usage limit ends the run without recording the failed attempt, so
        // a later start runs it again.
        if (!r.ok && /usage limit|rate limit|limit reached|resets? at/i.test(`${r.error ?? ''} ${r.answer ?? ''}`)) {
          console.error(`stopped at ${c.id} ${arm}: usage limit. Start the same command again later to continue.`)
          console.error((r.error || r.answer || '').slice(0, 300))
          process.exit(2)
        }
        appendFileSync(manifest, JSON.stringify({ id: c.id, arm, order: i + 1, repeat: rep, session: r.session, model, claudeCode: version, at: new Date().toISOString() }) + '\n')
        appendFileSync(file, JSON.stringify({ ...r, claudeCode: version }) + '\n')
        console.log(`${c.id} ${arm}: ${r.ok ? 'ok' : 'FAILED'} ${r.turns ?? '-'} turns, ${r.tools} tools, ${r.outputTokens ?? '-'} out, ${Math.round((r.ms ?? 0) / 1000)} s${r.asked ? ', asked back' : ''}${r.check ? `, check ${r.check.pass ? 'pass' : 'fail'}` : ''}`)
      })
    }
  }
  console.log(`wrote ${file}`)
}

// Small seeded generator so the bootstrap gives the same interval every time.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

// Bootstrap of the median paired difference.
function bootstrap(diffs, n = 1000, seed = 20261009) {
  const r = rng(seed)
  const meds = []
  for (let i = 0; i < n; i++) {
    const sample = diffs.map(() => diffs[Math.floor(r() * diffs.length)])
    meds.push(median(sample))
  }
  meds.sort((a, b) => a - b)
  return [meds[Math.floor(0.025 * n)], meds[Math.floor(0.975 * n) - 1]]
}

export function summarize(file) {
  const runs = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.repeat === 1 || r.repeat === undefined)
  const keep = new Set(
    readFileSync(join(bench, 'rewrites', 'index.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.outcome !== 'rewritten').map(x => x.id),
  )
  const by = {}
  for (const r of runs) (by[r.id] ??= {})[r.arm] = r
  const pairs = Object.entries(by).filter(([id, p]) => p.raw && p.rewritten && !keep.has(id))
  const metrics = [
    ['turns', r => r.turns],
    ['tools', r => r.tools],
    ['outputTokens', r => r.outputTokens],
    ['seconds', r => r.ms / 1000],
  ]
  const rows = metrics.map(([name, f]) => {
    const ok = pairs.filter(([, p]) => p.raw.ok && p.rewritten.ok)
    const diffs = ok.map(([, p]) => f(p.rewritten) - f(p.raw))
    const [lo, hi] = bootstrap(diffs)
    return { name, n: diffs.length, raw: median(ok.map(([, p]) => f(p.raw))), rewritten: median(ok.map(([, p]) => f(p.rewritten))), diff: median(diffs), lo, hi }
  })
  const count = (arm, pred) => pairs.filter(([, p]) => pred(p[arm])).length
  const checked = pairs.filter(([, p]) => p.raw.check)
  return {
    file,
    model: runs[0]?.model,
    claudeCode: runs[0]?.claudeCode,
    cases: Object.keys(by).length,
    paired: pairs.length,
    keep: [...keep],
    failed: runs.filter(r => !r.ok).map(r => `${r.id}/${r.arm}`),
    rows,
    asked: { raw: count('raw', r => r.asked), rewritten: count('rewritten', r => r.asked) },
    asksPattern: { raw: count('raw', r => r.asksPattern), rewritten: count('rewritten', r => r.asksPattern) },
    checks: {
      n: checked.length,
      raw: checked.filter(([, p]) => p.raw.check?.pass).length,
      rewritten: checked.filter(([, p]) => p.rewritten.check?.pass).length,
    },
    cost: runs.reduce((a, r) => a + (r.cost ?? 0) + (r.context?.cost ?? 0), 0),
    wallSeconds: Math.round(runs.reduce((a, r) => a + (r.wallMs ?? 0) + (r.context?.ms ?? 0), 0) / 1000),
  }
}

function summary() {
  const file = args[1]
  if (!file) {
    console.error('summary needs the runs file')
    process.exit(1)
  }
  const s = summarize(file)
  const f = x => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10) : '-')
  console.log(`${s.model}, ${s.claudeCode}; ${s.cases} cases, ${s.paired} paired (KEEP left out: ${s.keep.join(', ')})`)
  if (s.failed.length) console.log(`failed runs: ${s.failed.join(', ')}`)
  console.log('metric        raw med  rewritten med  paired diff med  95% CI')
  for (const r of s.rows) console.log(`${r.name.padEnd(13)} ${String(f(r.raw)).padStart(7)}  ${String(f(r.rewritten)).padStart(13)}  ${String(f(r.diff)).padStart(15)}  [${f(r.lo)}, ${f(r.hi)}]${r.lo <= 0 && r.hi >= 0 ? '  covers 0' : ''}`)
  console.log(`ended on a question: raw ${s.asked.raw}/${s.paired}, rewritten ${s.asked.rewritten}/${s.paired}; question words in the last lines: raw ${s.asksPattern.raw}, rewritten ${s.asksPattern.rewritten}`)
  console.log(`checks passed: raw ${s.checks.raw}/${s.checks.n}, rewritten ${s.checks.rewritten}/${s.checks.n}`)
  console.log(`cost (API equivalent) ${s.cost.toFixed(2)} USD, ${s.wallSeconds} s`)
}

if (command === 'rewrites') rewrites()
else if (command === 'run') run()
else if (command === 'summary') summary()
else {
  const lines = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1)
  const head = lines.slice(0, lines.findIndex(l => !l.startsWith('//')))
  console.log(head.map(l => l.slice(3)).join('\n'))
  process.exit(command === '--help' || command === undefined ? 0 : 1)
}
