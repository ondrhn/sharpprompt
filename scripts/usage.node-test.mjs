// node --test scripts/usage.node-test.mjs
// The export and the report on one fake store; they run in Node, outside the
// plugin, so `claude plugin test` does not pick this file up.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
