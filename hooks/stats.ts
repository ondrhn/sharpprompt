import type { SharppromptDecision } from '../types'

// What we keep per turn and how /sharp stats sums it up. Everything stays in
// $.store on the user's machine.

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type TurnRecord = {
  // How the prompt that started the turn got there.
  prompt: 'typed' | 'rewritten' | 'edited' | 'context'
  durationMs: number
  tools: number
  // Claude's final text ended on a question: it needed more from the user.
  asked: boolean
  usage?: Tokens
  aborted: boolean
}

export type RewriteRecord = {
  outcome: string
  via: 'fork' | 'complete'
  ms: number
  classifyMs?: number
  usage?: Tokens
  // Words in the draft and in the rewrite, when there was one.
  words?: [number, number?]
  // The session model the fork ran on.
  model?: string
  // When it happened (ms since the epoch), and the helper model when the
  // rewrite was the fallback completion rather than a fork.
  at?: number
  helper?: string
}

// Every classified prompt, so short-but-rough patterns show once n grows.
// The engine's classify returns a label only, no token usage; the words and
// the helper model let scripts/token_overhead.mjs estimate it.
export type ClassifyRecord = { verdict: string; ms: number; words: number; at?: number; model?: string }

// Every prompt a person typed and how it went (the counts key), with its time.
export type DecisionRecord = { at: number; key: string }

// Forks that lost the race and finished anyway, flushed at the end of a turn.
export type LateRecord = { at: number; forks: number; model?: string; usage?: Tokens }

export type Counts = Record<string, number>

export const MAX_RECORDS = 500

export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length

export function lastRewriteLine(r: RewriteRecord | undefined): string {
  if (!r) return 'Last rewrite: none yet'
  const w = r.words ? `, ${r.words[0]}${r.words[1] === undefined ? '' : ` -> ${r.words[1]}`} words` : ''
  const c = r.classifyMs === undefined ? '' : `classify ${r.classifyMs} ms, `
  return `Last rewrite: ${r.outcome}, ${c}${r.via} ${r.ms} ms${w}`
}

export function tokens(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | undefined): Tokens | undefined {
  if (!u) return undefined
  return { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens }
}

// The counter a decision bumps: why it passed, or what the classifier said.
export function countKey(d: SharppromptDecision): string {
  if (d.verdict === 'skip') return `skip:${d.reason}`
  return `verdict:${d.verdict}`
}

export function pct(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const fmt = (x: number | undefined, unit = '') => (x === undefined ? '-' : `${Math.round(x)}${unit}`)
const spread = (xs: readonly number[]) => (xs.length ? `${fmt(pct(xs, 50))} / ${fmt(pct(xs, 95))} ms (n=${xs.length})` : '-')
const share = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '-')

function turnLine(label: string, turns: readonly TurnRecord[]): string {
  const done = turns.filter(t => !t.aborted)
  return `${label}: n=${turns.length}, tools ${fmt(avg(done.map(t => t.tools)))}, ${fmt(avg(done.map(t => t.durationMs / 1000)), ' s')}, Claude asked back ${share(done.filter(t => t.asked).length, done.length)}, output ${fmt(avg(done.map(t => t.usage?.output ?? 0)), ' tok')}`
}

export function summary(counts: Counts, rewrites: readonly RewriteRecord[], turns: readonly TurnRecord[], classified: readonly ClassifyRecord[] = []): string {
  const c = (k: string) => counts[k] ?? 0
  const skips = Object.entries(counts)
    .filter(([k]) => k.startsWith('skip:'))
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.slice(5)} ${v}`)
  const seen = Object.entries(counts).filter(([k]) => k.startsWith('skip:') || k.startsWith('verdict:')).reduce((a, [, v]) => a + v, 0)
  const ok = rewrites.filter(r => r.outcome === 'rewritten')
  const forks = rewrites.filter(r => r.via === 'fork' && r.outcome !== 'timeout')
  const rough = c('verdict:rough')
  const spent = rewrites.map(r => r.usage).filter((u): u is Tokens => !!u)

  return [
    `Prompts seen: ${seen}. Passed by the gate: ${skips.join(', ') || 'none'}.`,
    `Classified: clear ${c('verdict:clear')}, rough ${rough}, timeout ${c('verdict:timeout')}, error ${c('verdict:error')}.`,
    `Rewrites: ${ok.length} made, ${rewrites.length - ok.length} not (${['keep', 'same', 'too-long', 'empty', 'timeout', 'error'].map(o => `${o} ${rewrites.filter(r => r.outcome === o).length}`).join(', ')}).`,
    `What you did with them: sent as is ${c('answer:as-is')}, edited ${c('answer:edited')}, took yours back ${c('answer:original')}.`,
    `Wait (p50 / p95): classify ${spread(classified.map(x => x.ms))}, fork ${spread(forks.map(r => r.ms))}, fallback completion ${spread(rewrites.filter(r => r.via === 'complete').map(r => r.ms))}.`,
    `Cost per rough prompt: ${fmt(avg(spent.map(u => u.input)))} in, ${fmt(avg(spent.map(u => u.cacheRead)))} from cache, ${fmt(avg(spent.map(u => u.output)))} out. Forks that lost the race and finished anyway: ${c('late:forks')}, ${c('late:output')} output tokens, ${c('late:input')} input.`,
    turnLine('Turns after a typed prompt', turns.filter(t => t.prompt === 'typed')),
    turnLine('Turns after a rewrite', turns.filter(t => t.prompt !== 'typed')),
    turns.length < 30 ? 'Too few turns to compare yet; these numbers are not evidence.' : '',
  ]
    .filter(Boolean)
    .join('\n')
}
