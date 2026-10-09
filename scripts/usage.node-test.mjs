// node --test scripts/usage.node-test.mjs
// The export and the report on one fake store; they run in Node, outside the
// plugin, so `claude plugin test` does not pick this file up.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { exportLines, storeFiles } from './export_log.mjs'
import { report, sentenceDiff } from './usage_report.mjs'

const RECORD = {
  id: '1760000000000-0',
  at: '2026-10-14T09:00:00.000Z',
  model: 'claude-opus-5-5',
  draft: 'make the login thing work better',
  verdict: 'rough',
  classifyMs: 900,
  outcome: 'rewritten',
  via: 'fork',
  ms: 4100,
  rewrite: 'The login test fails. Find the cause and fix it.',
  questions: [{ question: 'Which test?', options: ['auth', 'session'] }],
  answers: { 'Which test?': 'auth' },
  delivered: 'fill',
  boxed: 'The login test fails. Find the cause and fix it. Use the auth test.',
  action: 'edited',
  sent: 'The login test fails. Find the cause and fix it. Use the auth test. No new deps.',
  turn: { durationMs: 30000, tools: 4, asked: false, aborted: false },
}

test('export finds the store and writes one line per item; the report reads it back', () => {
  const config = mkdtempSync(join(tmpdir(), 'sharpprompt-export-'))
  try {
    mkdirSync(join(config, 'plugins', 'store'), { recursive: true })
    const store = join(config, 'plugins', 'store', 'sharpprompt_inline-test.json')
    writeFileSync(store, JSON.stringify({ log: [RECORD], turns: [{ prompt: 'edited', durationMs: 30000, tools: 4, asked: false, aborted: false }], counts: { 'verdict:rough': 1, 'answer:edited': 1 } }))
    assert.deepEqual(storeFiles(config), [store])
    const lines = exportLines([store])
    assert.equal(lines.filter(l => l.type === 'log').length, 1)
    assert.equal(lines.find(l => l.type === 'log').draft, RECORD.draft)

    const out = join(config, 'export.jsonl')
    const r = spawnSync('node', [new URL('./export_log.mjs', import.meta.url).pathname, '--out', out], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const back = readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.equal(back.length, 3)

    const md = report(back)
    assert.match(md, /edited, then sent \| 1 \(100%\)/)
    assert.match(md, /- No new deps\./)
    assert.match(md, /Which test\? \(auth \/ session\): auth/)
  } finally {
    rmSync(config, { recursive: true, force: true })
  }
})

test('sentence diff', () => {
  assert.deepEqual(sentenceDiff('A one. B two.', 'A one. C three.'), { removed: ['B two.'], added: ['C three.'] })
})

test('token overhead: plugin calls against interactive session tokens in the window', async () => {
  const { pluginSide, sessionSide, report, dollars } = await import('./token_overhead.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'sharpprompt-overhead-'))
  try {
    const from = Date.parse('2026-10-14T00:00:00Z')
    const to = from + 24 * 3600 * 1000
    const at = from + 3600 * 1000
    const store = {
      rewrites: [
        { outcome: 'rewritten', via: 'fork', ms: 4000, model: 'claude-opus-5-5', at, usage: { input: 2000, output: 200, cacheRead: 60000, cacheWrite: 0 } },
        { outcome: 'rewritten', via: 'fork', ms: 4000, model: 'claude-opus-5-5', usage: { input: 1, output: 1, cacheRead: 1, cacheWrite: 0 } },
        { outcome: 'rewritten', via: 'fork', ms: 4000, model: 'claude-opus-5-5', at: to + 1, usage: { input: 9, output: 9, cacheRead: 9, cacheWrite: 0 } },
      ],
      classified: [{ verdict: 'rough', ms: 900, words: 10, at, model: 'haiku' }],
      late: [{ at, forks: 1, model: 'claude-opus-5-5', usage: { input: 0, output: 100, cacheRead: 0, cacheWrite: 0 } }],
      decisions: [{ at, key: 'verdict:rough' }, { at, key: 'skip:too-short' }, { at: from - 1, key: 'skip:raw' }],
    }
    const p = pluginSide([store], from, to)
    assert.equal(p.rewrites, 1)
    assert.equal(p.undated, 1)
    assert.equal(p.late, 1)
    assert.deepEqual(p.byModel['claude-opus-5-5'], { input: 2000, output: 300, cacheRead: 60000, write5m: 0, write1h: 0 })
    assert.equal(p.byModel['claude-haiku-5-5'].input, 264)

    // Two rows of one interactive response (same requestId), one headless run,
    // one row outside the window.
    const proj = join(dir, 'projects', '-home-me-app')
    mkdirSync(proj, { recursive: true })
    const row = (requestId, entrypoint, ts, output) => JSON.stringify({ type: 'assistant', requestId, entrypoint, timestamp: new Date(ts).toISOString(), message: { model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100000, cache_creation_input_tokens: 5000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 5000 } } } })
    writeFileSync(join(proj, 's.jsonl'), [row('r1', 'cli', at, 5), row('r1', 'cli', at, 3000), row('r2', 'sdk-cli', at, 999), row('r3', 'cli', from - 10, 999)].join('\n') + '\n')
    utimesSync(join(proj, 's.jsonl'), new Date(at), new Date(at))
    const s = sessionSide(join(dir, 'projects'), from, to)
    assert.equal(s.requests, 1)
    assert.equal(s.skipped.headless, 1)
    assert.deepEqual(s.byModel['claude-opus-5-5'], { input: 10, output: 3000, cacheRead: 100000, write5m: 0, write1h: 5000 })
    assert.equal(sessionSide(join(dir, 'projects'), from, to, { exclude: ['app'] }).requests, 0)

    const md = report(p, s, from, to)
    assert.match(md, /\| output \| 308 \| 3,000 \| 10\.27% \|/)
    assert.match(md, /Prompts typed: 2; passed by the gate 1; classified 1; rewrites 1/)
    assert.match(md, /not a share of the plan's limit/)
    // Opus 5.5: 10 in, 3000 out, 100k cache read, 5k 1h write.
    assert.equal(dollars(s.byModel['claude-opus-5-5'], 'claude-opus-5-5').toFixed(4), (10 * 4e-6 + 3000 * 20e-6 + 100000 * 0.2e-6 + 5000 * 8e-6).toFixed(4))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
