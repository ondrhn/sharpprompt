#!/usr/bin/env node
// Copies sharpprompt's usage log out of its store into a JSONL file, for
// reading or for scripts/usage_report.mjs. Runs outside the plugin; nothing
// leaves the machine.
//
// node scripts/export_log.mjs [--store <file>] [--out <file>]
//
// The store is a JSON file per install under the Claude Code configuration
// directory: <config>/plugins/store/sharpprompt_<source>-<hash>.json, where
// <config> is $CLAUDE_CONFIG_DIR or ~/.claude. Without --store every such
// file is read. Without --out the file is docs/measurements/usage/<date>.jsonl.
//
// One line per item: {"type": "log" | "turn" | "rewrite" | "counts", "store": <file name>, ...}.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export function storeFiles(configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')) {
  const dir = join(configDir, 'plugins', 'store')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.startsWith('sharpprompt_') && f.endsWith('.json'))
    .map(f => join(dir, f))
}

export function exportLines(files) {
  const lines = []
  for (const file of files) {
    const store = JSON.parse(readFileSync(file, 'utf8'))
    const from = basename(file)
    for (const r of Array.isArray(store.log) ? store.log : []) lines.push({ type: 'log', store: from, ...r })
    for (const t of Array.isArray(store.turns) ? store.turns : []) lines.push({ type: 'turn', store: from, ...t })
    for (const r of Array.isArray(store.rewrites) ? store.rewrites : []) lines.push({ type: 'rewrite', store: from, ...r })
    if (store.counts && typeof store.counts === 'object') lines.push({ type: 'counts', store: from, counts: store.counts })
  }
  return lines
}

function main(args) {
  const opt = name => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const files = opt('store') ? [opt('store')] : storeFiles()
  if (files.length === 0) {
    console.error('no sharpprompt store found; pass --store <file>')
    process.exit(1)
  }
  const root = new URL('..', import.meta.url).pathname
  const out = opt('out') ?? join(root, 'docs/measurements/usage', `${new Date().toISOString().slice(0, 10)}.jsonl`)
  const lines = exportLines(files)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  const n = lines.filter(l => l.type === 'log').length
  console.log(`${out}: ${n} log records, ${lines.filter(l => l.type === 'turn').length} turns, from ${files.map(f => basename(f)).join(', ')}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
