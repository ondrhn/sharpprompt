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
//          --cases tr   use the Turkish corpus (cases-tr.jsonl); rewrites go to
//            rewrites/<family>-tr/ and are written in English
//          --cases v2   the v2 corpus (fixture-v2, checks-v2): rewrites may ask
//            questions, answered by an oracle model that knows what the user
//            meant (--oracle, default claude-sonnet-5-5), and get the session facts
//
//   summary <runs.jsonl>   paired differences (rewritten minus raw) over the
//              cases whose rewrite is not KEEP, medians and a bootstrap 95%
//              interval (1,000 resamples, fixed seed)
//
//   judge <runs.jsonl> --judge-model <id>   a blind judge reads, for each
//              paired case, the user's request, what a good answer does, and
//              the two final answers in a random order with the arms hidden;
//              it picks A, B or tie, and scores each answer 1 to 5 on its own.
//              Writes <runs>.judge.jsonl beside the runs and prints a summary

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const bench = join(root, 'docs/bench')
const { completePrompt, clean, familyOf } = await import(join(root, 'hooks/rewrite.ts'))
const { endsWithQuestion } = await import(join(root, 'hooks/gate.ts'))
const { sessionFacts } = await import(join(root, 'hooks/facts.ts'))
const { applyAnswers, splitReply } = await import(join(root, 'hooks/questions.ts'))

const args = process.argv.slice(2)
const command = args[0]
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i > 0 && args[i + 1] ? args[i + 1] : fallback
}

// The corpus: cases.jsonl, or cases-<x>.jsonl with --cases <x>.
const corpus = opt('cases', '')
const suffix = corpus ? `-${corpus}` : ''
const rewritesDir = family => join(bench, 'rewrites', `${family}${suffix}`)
const fixtureDir = corpus === 'v2' ? join(bench, 'fixture-v2') : join(bench, 'fixture')
const checksDir = corpus === 'v2' ? join(bench, 'checks-v2') : join(bench, 'checks')

function loadCases(name = corpus) {
  const all = readFileSync(join(bench, name ? `cases-${name}.jsonl` : 'cases.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const only = opt('only', '')
  return only ? all.filter(c => only.split(',').includes(c.id)) : all
}

// Claude Code replaces its own binary when it updates, and a spawn in that
// moment fails with ENOENT; wait and try again rather than lose the run.
function spawnClaude(args, options) {
  for (let i = 0; ; i++) {
    const r = spawnSync('claude', args, options)
    if (r.error?.code !== 'ENOENT' || i === 9) return r
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000)
  }
}

// One headless completion, no tools, in an empty folder so no project
// instructions are picked up.
function complete(model, prompt) {
  const dir = mkdtempSync(join(tmpdir(), 'sharpprompt-rw-'))
  try {
    const r = spawnClaude(['-p', '--model', model, '--tools', '', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'], {
      cwd: dir,
      env: childEnv(),
      input: prompt,
      encoding: 'utf8',
      timeout: 300_000,
    })
    if (r.status !== 0) return { error: `exit ${r.status}${r.signal ? ` ${r.signal}` : ''}${r.error ? ` ${r.error.message}` : ''}: ${(r.stderr || r.stdout || '').slice(0, 300)}` }
    const out = JSON.parse(r.stdout)
    return { text: out.result ?? '', ms: out.duration_ms, usage: out.usage }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// What the simulated user knows and did not write: the hidden constraint, or
// which of two functions they meant, or which failing test.
function intentOf(c) {
  if (c.hidden) return c.hidden.spec
  if (c.target) return `You meant only ${c.target.replace('.', '.py, function ')}, the one discussed most recently; ${c.decoy.replace('.', '.py, function ')} should stay exactly as it is.`
  if (c.setup) return `You meant the test that just failed in ${c.check.args[0]}: make it pass as written, by changing ${c.check.args[1]}.py only.`
  return 'Nothing beyond what you wrote.'
}

// A closed oracle: answers only the question asked, from what the user knows.
function askOracle(model, c, q) {
  const labels = q.options.map(o => o.label)
  const prompt = `You are the user of a coding assistant. You asked it: "${c.raw}"

One thing you know and did not write down: ${intentOf(c)}

The assistant asks you: ${q.question}
Options: ${labels.map(l => `"${l}"`).join(', ')}

Answer only this question, using only the part of what you know that it asks about; say nothing about anything else, even if you know it. Reply with exactly one of the option labels when one of them states your answer. When none does, or when the options are ways of giving the information rather than the information itself (like "paste a sample"), reply with "Other: " and one short sentence that answers only this question. Reply with the answer alone.`
  const r = complete(model, prompt)
  if ('error' in r) return ''
  const a = r.text.trim().replace(/^["']|["']$/g, '')
  const hit = labels.find(l => a.toLowerCase() === l.toLowerCase())
  return hit ?? a.replace(/^Other:\s*/i, '')
}

function rewrites() {
  const helper = opt('helper', 'haiku')
  const family = opt('family', 'fable')
  const dir = rewritesDir(family)
  mkdirSync(dir, { recursive: true })
  // The Turkish corpus measures rewriting into English (rewriteLanguage: en).
  const language = corpus ? 'en' : 'same'
  const index = []
  for (const c of loadCases()) {
    const v2 = corpus === 'v2'
    const opts = v2 ? { language, ask: true, facts: sessionFacts(c.context), window: 100 } : { language }
    const prompt = completePrompt(c.raw, family, c.context, [], opts)
    const r = complete(helper, prompt)
    let record = null
    if (v2 && !r.error) {
      const { body, questions } = splitReply(r.text)
      const oracleAnswers = {}
      for (const q of questions) oracleAnswers[q.question] = askOracle(opt('oracle', 'claude-sonnet-5-5'), c, q)
      // As in the plugin: clean the rewrite, then add the answers; a
      // rejected rewrite (KEEP, too long) means the prompt goes as typed.
      const cl0 = clean(body, c.raw)
      const ok = 'rewritten' in cl0
      const before = ok ? cl0.rewritten : c.raw
      const after = ok && questions.length ? applyAnswers(before, questions, oracleAnswers) : before
      record = { questions, oracleAnswers, recommended: questions.map(q => q.options[0]?.label), rewriteBeforeAnswers: before, outcome: ok ? 'rewritten' : cl0.rejected, final: after }
    }
    let outcome
    let text
    if (r.error) {
      outcome = 'error'
      text = c.raw
    } else if (record) {
      outcome = record.outcome
      text = record.final
    } else {
      const cl = clean(r.text, c.raw)
      outcome = 'rewritten' in cl ? 'rewritten' : cl.rejected
      // What the plugin would send: the rewrite, or the prompt as typed.
      text = 'rewritten' in cl ? cl.rewritten : c.raw
    }
    writeFileSync(join(dir, `${c.id}.txt`), text + '\n')
    if (record) writeFileSync(join(dir, `${c.id}.json`), JSON.stringify(record, null, 2) + '\n')
    index.push({ id: c.id, outcome, helper, family, language, ...(r.error ? { error: r.error.slice(0, 200) } : {}), ms: r.ms ?? null, words: [c.raw.split(/\s+/).length, text.split(/\s+/).length] })
    console.log(`${c.id}: ${outcome}${r.ms ? ` in ${r.ms} ms` : ''}`)
  }
  const file = join(dir, 'index.jsonl')
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

// Tool calls in the context are written out as text, the same for both arms.
function contextMessage(context) {
  const lines = context.map(m => {
    const uses = (m.toolUses ?? []).map(u =>
      u.tool === 'Bash' ? `[You ran \`${u.input.command}\`. Output:\n${u.text}]` : `[You used ${u.tool} on ${u.input.file_path ?? JSON.stringify(u.input)}]`,
    )
    return `${m.role === 'user' ? 'Me' : 'You'}: ${[m.text, ...uses].filter(Boolean).join('\n')}`
  })
  return `For context, this is what we said earlier in this conversation. No action needed; just reply "ok".\n\n${lines.join('\n\n')}`
}

const OFFER = /\b(want me to|should i|do you want me|shall i|would you like me|do you want that|want that)\b/i
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
  // sharpprompt picks its rules by the session model's family, so the
  // rewritten arm reads the rewrites made for that family.
  const text = arm === 'raw' ? c.raw : readFileSync(join(rewritesDir(familyOf(model)), `${c.id}.txt`), 'utf8').trim()
  const base = mkdtempSync(join(tmpdir(), 'sharpprompt-bench-'))
  const dir = join(base, 'expenses')
  cpSync(fixtureDir, dir, { recursive: true })
  for (const [path, content] of Object.entries(c.setup ?? {})) writeFileSync(join(dir, path), content)
  const session = randomUUID()
  const env = childEnv()
  const out = { id: c.id, shape: c.shape, family: c.family, arm, order, repeat, session, model, corpus: corpus || 'en' }

  try {
    if (c.context.length > 0) {
      const r = spawnClaude([...CLAUDE_ARGS(model), '--session-id', session, '--output-format', 'json'], {
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
      // Ended on a question that wants input, not an offer to go on.
      inputQuestion: endsWithQuestion(answer) && !OFFER.test(answer.split('\n').filter(Boolean).slice(-1)[0] ?? ''),
      answer: answer.slice(0, 4000),
    })
    if (!out.ok) out.error = (r.stderr || '').slice(0, 500)
    if (c.check) {
      const script = typeof c.check === 'string' ? c.check : c.check.script
      const checkArgs = typeof c.check === 'string' ? [] : c.check.args
      const k = spawnSync('python3', [join(checksDir, script), ...checkArgs], {
        cwd: dir, env: { ...process.env, PYTHONPATH: checksDir }, encoding: 'utf8', timeout: 60_000,
      })
      out.check = { name: [script, ...checkArgs].join(' '), pass: k.status === 0, out: (k.stdout + k.stderr).trim().slice(-200) }
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
  const family = familyOf(model)
  if (!existsSync(join(rewritesDir(family), 'index.jsonl'))) {
    console.error(`no rewrites for ${family}${suffix} yet: run "rewrites --family ${family}${corpus ? ` --cases ${corpus}` : ''}" first`)
    process.exit(1)
  }
  const version = spawnClaude(['--version'], { encoding: 'utf8' }).stdout.trim()
  const date = new Date().toISOString().slice(0, 10)
  const runs = join(bench, 'runs')
  mkdirSync(runs, { recursive: true })
  const stem = join(runs, `${date}${suffix}-${model}${opt('only', '') ? '-partial' : ''}`)
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

// Cases whose rewrite came back KEEP send the same text in both arms.
function keepSet(runs) {
  const c = runs[0]?.corpus && runs[0].corpus !== 'en' ? `-${runs[0].corpus}` : ''
  const file = join(bench, 'rewrites', `${familyOf(runs[0].model)}${c}`, 'index.jsonl')
  return new Set(readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.outcome !== 'rewritten').map(x => x.id))
}

// Rough language of an answer: Turkish letters and common Turkish words
// against common English ones.
export function languageOf(text) {
  const words = text.toLowerCase().match(/[a-zçğıöşü]+/g) ?? []
  const tr = new Set(['ve', 'bir', 'bu', 'için', 'icin', 'değil', 'degil', 'ama', 'çok', 'cok', 'şu', 'su', 'ile', 'da', 'de', 'mi', 'var', 'yok', 'olarak', 'gibi', 'daha', 'şimdi', 'simdi', 'eğer', 'yani'])
  const en = new Set(['the', 'and', 'is', 'to', 'of', 'it', 'in', 'that', 'for', 'with', 'this', 'not', 'are', 'was', 'you', 'be'])
  const t = words.filter(w => tr.has(w) || /[çğışöü]/.test(w)).length
  const e = words.filter(w => en.has(w)).length
  if (t + e === 0) return 'unknown'
  const share = t / (t + e)
  return share > 0.7 ? 'tr' : share < 0.3 ? 'en' : 'mixed'
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
  const keep = keepSet(runs)
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
    languages: Object.fromEntries(['raw', 'rewritten'].map(arm => {
      const count = {}
      for (const [, p] of pairs) {
        const l = languageOf(p[arm].answer ?? '')
        count[l] = (count[l] ?? 0) + 1
      }
      return [arm, count]
    })),
    inputQuestions: { raw: count('raw', r => r.inputQuestion), rewritten: count('rewritten', r => r.inputQuestion) },
    byFamily: Object.fromEntries(
      [...new Set(pairs.map(([, p]) => p.raw.family).filter(Boolean))].map(f => {
        const ps = pairs.filter(([, p]) => p.raw.family === f && p.raw.check)
        return [f, { n: ps.length, raw: ps.filter(([, p]) => p.raw.check?.pass).length, rewritten: ps.filter(([, p]) => p.rewritten.check?.pass).length }]
      }),
    ),
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
  console.log(`answer language: raw ${JSON.stringify(s.languages.raw)}, rewritten ${JSON.stringify(s.languages.rewritten)}`)
  console.log(`questions wanting input (not offers): raw ${s.inputQuestions.raw}, rewritten ${s.inputQuestions.rewritten}`)
  for (const [f, v] of Object.entries(s.byFamily)) console.log(`  ${f}: checks raw ${v.raw}/${v.n}, rewritten ${v.rewritten}/${v.n}`)
  console.log(`cost (API equivalent) ${s.cost.toFixed(2)} USD, ${s.wallSeconds} s`)
}

function askJSON(model, prompt) {
  const r = complete(model, prompt)
  if ('error' in r) return { error: r.error }
  const m = r.text.match(/\{[\s\S]*\}/)
  try {
    return m ? JSON.parse(m[0]) : { error: `no JSON in: ${r.text.slice(0, 200)}` }
  } catch {
    return { error: `bad JSON in: ${r.text.slice(0, 200)}` }
  }
}

function request(c) {
  const ctx = c.context.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n')
  return `${ctx ? `Earlier in the conversation:\n${ctx}\n\n` : ''}The user then wrote:\n${c.raw}`
}

const PAIR = (c, a, b) => `You are judging two answers from a coding assistant working in a small Python project (expense totals). Both answered the same user request; you see only each answer's final message, not the files it changed.

${request(c)}

What a good answer does: ${c.expect}
${c.language === 'tr' ? '\nThe user wrote in Turkish. An answer may be in Turkish or English; do not prefer either language for its own sake.\n' : ''}
<answer_a>
${a}
</answer_a>

<answer_b>
${b}
</answer_b>

Which answer better does what the user wanted? Judge substance (did it do the right thing, at the right scope, and say what it did), not length or formatting. Reply with JSON only: {"winner": "A" | "B" | "tie", "reason": "<one sentence>"}`

const SINGLE = (c, a) => `You are judging one answer from a coding assistant working in a small Python project (expense totals). You see only its final message, not the files it changed.

${request(c)}

What a good answer does: ${c.expect}
${c.language === 'tr' ? '\nThe user wrote in Turkish. The answer may be in Turkish or English; do not score the language itself.\n' : ''}
<answer>
${a}
</answer>

How well does this answer do what the user wanted, from 1 (not at all) to 5 (fully, at the right scope)? Reply with JSON only: {"score": 1-5, "reason": "<one sentence>"}`

// Two-sided sign test: chance of a split at least this uneven under 50/50.
function signTest(wins, losses) {
  const n = wins + losses
  if (n === 0) return 1
  const k = Math.min(wins, losses)
  let p = 0
  let c = 1
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i
    if (i <= k) p += c
  }
  return Math.min(1, (2 * p) / 2 ** n)
}

function judge() {
  const file = args[1]
  const model = opt('judge-model', '')
  if (!file || !model) {
    console.error('judge needs the runs file and --judge-model <id>')
    process.exit(1)
  }
  const runs = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => (r.repeat ?? 1) === 1)
  const corpusOfRuns = runs[0]?.corpus && runs[0].corpus !== 'en' ? runs[0].corpus : ''
  const cases = Object.fromEntries(loadCases(corpusOfRuns).map(c => [c.id, c]))
  const keep = keepSet(runs)
  const by = {}
  for (const r of runs) (by[r.id] ??= {})[r.arm] = r
  const out = file.replace(/\.jsonl$/, '.judge.jsonl')
  const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : [])
  const r = rng(424242)
  for (const [id, p] of Object.entries(by)) {
    if (keep.has(id) || !p.raw?.ok || !p.rewritten?.ok || done.has(id) || !cases[id]) continue
    const c = cases[id]
    const rewrittenFirst = r() < 0.5
    const [a, b] = rewrittenFirst ? [p.rewritten.answer, p.raw.answer] : [p.raw.answer, p.rewritten.answer]
    const pair = askJSON(model, PAIR(c, a, b))
    const winner = pair.winner === 'tie' ? 'tie' : pair.winner === 'A' ? (rewrittenFirst ? 'rewritten' : 'raw') : pair.winner === 'B' ? (rewrittenFirst ? 'raw' : 'rewritten') : null
    const raw = askJSON(model, SINGLE(c, p.raw.answer))
    const rewritten = askJSON(model, SINGLE(c, p.rewritten.answer))
    const row = { id, judge: model, rewrittenFirst, winner, reason: pair.reason ?? pair.error, scores: { raw: raw.score ?? null, rewritten: rewritten.score ?? null }, reasons: { raw: raw.reason ?? raw.error, rewritten: rewritten.reason ?? rewritten.error } }
    appendFileSync(out, JSON.stringify(row) + '\n')
    console.log(`${id}: ${winner ?? 'no verdict'}; scores raw ${row.scores.raw}, rewritten ${row.scores.rewritten}`)
  }
  const rows = readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const w = rows.filter(x => x.winner === 'rewritten').length
  const l = rows.filter(x => x.winner === 'raw').length
  const t = rows.filter(x => x.winner === 'tie').length
  const scored = rows.filter(x => x.scores.raw && x.scores.rewritten)
  const mean = xs => xs.reduce((s, v) => s + v, 0) / (xs.length || 1)
  const diffs = scored.map(x => x.scores.rewritten - x.scores.raw)
  console.log(`judge ${model}: rewritten won ${w}, raw won ${l}, tie ${t}; sign test p = ${signTest(w, l).toFixed(4)} (ties left out)`)
  console.log(`scores 1-5: raw mean ${mean(scored.map(x => x.scores.raw)).toFixed(2)}, rewritten mean ${mean(scored.map(x => x.scores.rewritten)).toFixed(2)}, paired difference mean ${mean(diffs).toFixed(2)} (n=${scored.length})`)
}

if (command === 'rewrites') rewrites()
else if (command === 'run') run()
else if (command === 'summary') summary()
else if (command === 'judge') judge()
else {
  const lines = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1)
  const head = lines.slice(0, lines.findIndex(l => !l.startsWith('//')))
  console.log(head.map(l => l.slice(3)).join('\n'))
  process.exit(command === '--help' || command === undefined ? 0 : 1)
}
