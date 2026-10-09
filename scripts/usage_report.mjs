#!/usr/bin/env node
// Reads a usage export (scripts/export_log.mjs) and prints a markdown report:
// what the user did with the rewrites, rough against clear, the wait, the
// edits, the drafts taken back, and the questions with their answers.
//
// node scripts/usage_report.mjs docs/measurements/usage/<date>.jsonl [--out <file>]
//
// A skeleton for the analysis on 28 October; the numbers it prints are
// counts, no tests of significance.

import { readFileSync, writeFileSync } from 'node:fs'

const pct = (xs, p) => {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const share = (n, of) => (of ? `${n} (${Math.round((100 * n) / of)}%)` : `${n}`)
const sentences = t => (t ?? '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
const quote = t => `> ${(t ?? '').replace(/\n/g, '\n> ')}`

// The sentences the user took out of the rewrite and the ones they put in.
export function sentenceDiff(before, after) {
  const a = sentences(before)
  const b = sentences(after)
  return { removed: a.filter(s => !b.includes(s)), added: b.filter(s => !a.includes(s)) }
}

export function report(lines) {
  const log = lines.filter(l => l.type === 'log')
  const counts = {}
  for (const l of lines.filter(l => l.type === 'counts')) for (const [k, v] of Object.entries(l.counts)) counts[k] = (counts[k] ?? 0) + v
  const c = k => counts[k] ?? 0

  const filled = log.filter(r => r.delivered === 'fill')
  const by = a => filled.filter(r => r.action === a)
  const open = filled.filter(r => !r.action)
  const waits = log.map(r => (r.classifyMs ?? 0) + r.ms)
  const asked = log.filter(r => r.questions?.length)

  const out = []
  out.push(`# Usage report`, '')
  out.push(`${log.length} logged rewrites from ${log[0]?.at?.slice(0, 10) ?? '-'} to ${log.at(-1)?.at?.slice(0, 10) ?? '-'}.`, '')
  out.push(`## What happened to the rewrites`, '')
  out.push(`| | n |`, `|---|---|`)
  out.push(`| put in the box | ${filled.length} |`)
  out.push(`| sent as is | ${share(by('as-is').length, filled.length)} |`)
  out.push(`| edited, then sent | ${share(by('edited').length, filled.length)} |`)
  out.push(`| original taken back | ${share(by('original').length, filled.length)} |`)
  out.push(`| something else typed instead | ${share(by('abandoned').length, filled.length)} |`)
  out.push(`| no action recorded | ${share(open.length, filled.length)} |`)
  out.push(`| no rewrite (${[...new Set(log.filter(r => r.outcome !== 'rewritten').map(r => r.outcome))].join(', ') || '-'}) | ${log.filter(r => r.outcome !== 'rewritten').length} |`)
  out.push(`| question dialog closed | ${log.filter(r => r.answers === 'dismissed').length} |`, '')
  out.push(`## Rough and clear`, '')
  out.push(`Classified rough ${c('verdict:rough')}, clear ${c('verdict:clear')}, timeout ${c('verdict:timeout')}, error ${c('verdict:error')}; passed by the gate ${Object.entries(counts).filter(([k]) => k.startsWith('skip:')).reduce((a, [, v]) => a + v, 0)}.`, '')
  out.push(`## Wait`, '')
  out.push(`Classify plus rewrite, p50 ${pct(waits, 50) ?? '-'} ms, p95 ${pct(waits, 95) ?? '-'} ms (n=${waits.length}).`, '')
  out.push(`## Edits`, '')
  for (const r of by('edited')) {
    const d = sentenceDiff(r.boxed ?? r.rewrite, r.sent)
    out.push(`### ${r.at}`, '', 'Draft:', quote(r.draft), '')
    if (d.removed.length) out.push('Taken out:', ...d.removed.map(s => `- ${s}`), '')
    if (d.added.length) out.push('Put in:', ...d.added.map(s => `- ${s}`), '')
  }
  out.push(`## Drafts taken back`, '')
  for (const r of by('original')) out.push(`- ${r.at}: ${r.draft.replace(/\n/g, ' ')}`)
  out.push('', `## Questions`, '')
  for (const r of asked) {
    out.push(`### ${r.at}`, '', quote(r.draft), '')
    for (const q of r.questions) out.push(`- ${q.question} (${q.options.join(' / ')}): ${r.answers === 'dismissed' ? 'closed' : (r.answers?.[q.question] ?? '-')}`)
    out.push('')
  }
  return out.join('\n')
}

function main(args) {
  const file = args[0]
  if (!file) {
    console.error('usage: usage_report.mjs <export.jsonl> [--out <file>]')
    process.exit(1)
  }
  const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  const md = report(lines)
  const i = args.indexOf('--out')
  if (i >= 0 && args[i + 1]) writeFileSync(args[i + 1], md + '\n')
  else console.log(md)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
