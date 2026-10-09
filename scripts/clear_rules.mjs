#!/usr/bin/env node
// Could some prompts skip the classifier because they are plainly clear?
// Candidate rules, checked against a corpus of typed prompts labelled by Haiku.
// The corpus is the user's own prompts and stays outside the repository.
//
// node scripts/clear_rules.mjs cover <corpus.jsonl>
//   how many prompts each rule would let skip the classifier (no model call)
// node scripts/clear_rules.mjs label <corpus.jsonl> --out <labels.jsonl>
//   Haiku labels, one `claude -p` call per prompt, resumable
// node scripts/clear_rules.mjs eval <corpus.jsonl> <labels.jsonl>
//   per rule: prompts it takes, how many of those Haiku called rough (misses)
//
// The corpus is JSONL with a `text` field. The labelling prompt uses the
// plugin's two labels but not the engine's own classifier prompt, which a
// plugin cannot see; the labels are close to what the plugin gets, not the same.

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CLEAR = 'clear and specific'
export const ROUGH = 'rough: vague or missing what to deliver'

const words = t => t.split(/\s+/).filter(Boolean).length

// Each rule says "this prompt is clear" or nothing.
export const RULES = {
  'file:line': t => /[\w./-]+\.[a-z]{1,5}:\d+/i.test(t),
  'code block': t => /```/.test(t),
  'numbered steps': t => (t.match(/^\s*\d+[.)]\s+\S/gm) ?? []).length >= 2,
  'long, no question': t => words(t) >= 60 && !t.includes('?'),
  'file path and 12+ words': t => words(t) >= 12 && /(?:^|\s|`)[\w.-]+\/[\w./-]*\.[a-z]{1,5}\b/i.test(t),
  'pasted error': t => /Traceback \(most recent call last\)|\b\w*Error: |\n\s+at .+:\d+:\d+/.test(t),
}

const read = f => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

export function cover(corpus) {
  return Object.fromEntries(Object.entries(RULES).map(([name, rule]) => [name, corpus.filter(x => rule(x.text)).length]))
}

export function evaluate(corpus, labels) {
  const byText = new Map(labels.map(l => [l.text, l.label]))
  const rows = corpus.filter(x => byText.has(x.text))
  const rough = rows.filter(x => byText.get(x.text) === 'rough').length
  const out = { n: rows.length, rough, clear: rows.length - rough, rules: {} }
  for (const [name, rule] of Object.entries(RULES)) {
    const hit = rows.filter(x => rule(x.text))
    out.rules[name] = { takes: hit.length, misses: hit.filter(x => byText.get(x.text) === 'rough').length }
  }
  // The rules that pass the bar (at most 1 miss in 300, scaled to n), together.
  const bar = Math.floor(rows.length / 300)
  const kept = Object.entries(out.rules).filter(([, r]) => r.misses <= bar).map(([name]) => name)
  const union = rows.filter(x => kept.some(k => RULES[k](x.text)))
  out.kept = kept
  out.together = { takes: union.length, misses: union.filter(x => byText.get(x.text) === 'rough').length, share: rows.length ? union.length / rows.length : 0 }
  return out
}

function label(corpusFile, outFile) {
  const done = new Set(existsSync(outFile) ? read(outFile).map(l => l.text) : [])
  const env = { ...process.env }
  delete env.CLAUDE_CODE_CHILD_SESSION
  delete env.CLAUDECODE
  for (const x of read(corpusFile)) {
    if (done.has(x.text)) continue
    const dir = mkdtempSync(join(tmpdir(), 'sharpprompt-label-'))
    const prompt = `Classify the text below. Reply with exactly one of these labels and nothing else:\n${CLEAR}\n${ROUGH}\n\n<text>\n${x.text}\n</text>`
    const r = spawnSync('claude', ['-p', '--model', 'haiku', '--tools', '', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'], { cwd: dir, env, input: prompt, encoding: 'utf8', timeout: 120_000 })
    rmSync(dir, { recursive: true, force: true })
    if (r.status !== 0) {
      console.error(`stopped: ${(r.stderr || r.stdout || '').slice(0, 200)}`)
      process.exit(2)
    }
    const reply = (JSON.parse(r.stdout).result ?? '').trim().toLowerCase()
    const l = reply.startsWith('rough') ? 'rough' : reply.startsWith('clear') ? 'clear' : 'other'
    appendFileSync(outFile, JSON.stringify({ text: x.text, label: l, reply: reply.slice(0, 60) }) + '\n')
  }
}

function main(args) {
  const [cmd, corpusFile, third] = args
  if (cmd === 'cover') {
    const corpus = read(corpusFile)
    console.log(`n=${corpus.length}`)
    for (const [k, v] of Object.entries(cover(corpus))) console.log(`${k}: ${v} (${((100 * v) / corpus.length).toFixed(1)}%)`)
  } else if (cmd === 'label') {
    const i = args.indexOf('--out')
    label(corpusFile, args[i + 1])
  } else if (cmd === 'eval') {
    console.log(JSON.stringify(evaluate(read(corpusFile), read(third)), null, 2))
  } else {
    console.error('cover | label | eval; see the comment at the top')
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
