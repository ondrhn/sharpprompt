import type { SharppromptDecision, SharppromptMode } from '../types'
import { wordCount as words } from './stats'

// Pure helpers for delivery and the slash command.

export const MODES: readonly SharppromptMode[] = ['fill', 'replace', 'context', 'off']

// Words of any script, not just ASCII: split on \W, two Russian texts had
// no words at all and counted as the same. Marks (\p{M}) stay in the word,
// or Hindi falls apart into single consonants. Chinese, Japanese, Korean,
// Thai, Lao, Khmer and Myanmar put no spaces between words, or (Korean)
// glue endings to them: there pairs of characters stand in for words, and a
// Latin name glued to them (修复getUserProfile函数) stays one word.
// Script_Extensions, so the long-vowel mark ー stays in its katakana word.
const PAIRED = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}`
const CJK_RUN = new RegExp(`[${PAIRED}]+|[^${PAIRED}]+`, 'gu')
const IS_CJK = new RegExp(`^[${PAIRED}]`, 'u')
function bag(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of s.toLowerCase().split(/[^\p{L}\p{M}\p{N}_]+/u)) {
    for (const run of w.match(CJK_RUN) ?? []) {
      const chars = [...run]
      if (!IS_CJK.test(run) || chars.length < 2) {
        out.add(run)
        continue
      }
      for (let i = 0; i < chars.length - 1; i++) out.add(chars[i]! + chars[i + 1]!)
    }
  }
  return out
}

// Word overlap of two texts, 0 to 1. Above EDIT_OVERLAP a prompt sent while
// our suggestion sits in the box counts as the suggestion, edited.
export function overlap(a: string, b: string): number {
  const x = bag(a)
  const y = bag(b)
  // Nothing to compare (emoji only, say) is no evidence of an edit.
  if (x.size === 0 && y.size === 0) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

export const EDIT_OVERLAP = 0.4

// Share of a's words still in b, 0 to 1: one-sided, so adding to a text
// keeps it at 1 however much is added.
export function kept(a: string, b: string): number {
  const x = bag(a)
  if (x.size === 0) return 0
  const y = bag(b)
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / x.size
}

// Nearly all of a text still there: it was added to, not replaced. Kept
// alone is not enough below this, as small words count too and a new
// prompt on the same subject keeps most of them.
export const KEPT_ADDED = 0.9

// b is a, edited or added to: word overlap for an edit, or nearly all of a
// kept for an addition, which overlap alone took for a new prompt (23 Oct
// 2026: the person's own text put back with back to mine, added to and sent,
// got rewritten all over again).
export const isEditOf = (a: string, b: string) => overlap(a, b) >= EDIT_OVERLAP || kept(a, b) >= KEPT_ADDED

export function contextNote(rewritten: string): string {
  return `The sharpprompt plugin read the user's request above as the following. Use it only where it matches what the user wrote:\n${rewritten}`
}

export const DROP_NOTE = 'sharpprompt put a clearer version in the box. Enter sends it, ctrl+x tab then r puts yours back.'

export type Command =
  | { kind: 'status' }
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'mode'; mode: SharppromptMode }
  | { kind: 'undo' }
  | { kind: 'stats' }
  | { kind: 'try'; text: string }
  | { kind: 'help'; error?: string }

export function parseCommand(args: string): Command {
  const [word = '', ...rest] = args.trim().split(/\s+/)
  const tail = args.trim().slice(word.length).trim()
  switch (word.toLowerCase()) {
    case '':
    case 'status':
      return { kind: 'status' }
    case 'on':
      return { kind: 'on' }
    case 'off':
      return { kind: 'off' }
    case 'undo':
      return { kind: 'undo' }
    case 'stats':
      return { kind: 'stats' }
    case 'try':
      return tail ? { kind: 'try', text: tail } : { kind: 'help', error: 'try needs a prompt to try' }
    case 'mode': {
      const m = rest[0] as SharppromptMode | undefined
      return m && MODES.includes(m) ? { kind: 'mode', mode: m } : { kind: 'help', error: `mode is one of ${MODES.join(', ')}` }
    }
    default:
      return { kind: 'help', error: `unknown: ${word}` }
  }
}

export const HELP = `/sharpprompt (or /sharp) status | on | off | mode fill|replace|context|off | undo | stats | try <prompt>
Start a prompt with raw: to send it untouched.`

export function describe(d: SharppromptDecision | null): string {
  if (!d) return 'no prompt seen yet'
  if (d.verdict === 'skip') return `passed untouched (${d.reason})`
  const classify = d.classifyMs === undefined ? '' : ` in ${d.classifyMs} ms`
  if (!('rewrite' in d) || !d.rewrite) return `classified ${d.verdict}${classify}, sent as typed`
  const r = d.rewrite
  const size = r.text ? `, ${words(d.text)} -> ${words(r.text)} words` : `, ${words(d.text)} words`
  return `${d.verdict === 'long' ? 'long, tidied' : `classified ${d.verdict}`}${classify}, rewrite ${r.outcome} via ${r.via} in ${r.ms} ms${size}`
}
