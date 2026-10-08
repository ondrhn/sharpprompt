#!/usr/bin/env node
// Benchmark: does a sharpprompt rewrite make Claude's work easier than the
// rough prompt it came from? See docs/bench/README.md.
//
// node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs <command> [options]
//
//   rewrites   write docs/bench/rewrites/<id>.txt for every case, with the
//              plugin's own fallback template (no conversation to fork here)
//   run        (next step)
//
// Options: --helper <model> (default haiku), --family <fable|opus|sonnet|haiku|common>
//          (the family of the model the benchmark runs on; default fable),
//          --only <id,id,...>

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const bench = join(root, 'docs/bench')
const { completePrompt, clean } = await import(join(root, 'hooks/rewrite.ts'))

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

if (command === 'rewrites') rewrites()
else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'))
  process.exit(command === '--help' || command === undefined ? 0 : 1)
}
