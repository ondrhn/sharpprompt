import type { SharppromptDecision, SharppromptMode } from '../types'

// Pure helpers for delivery and the slash command.

export const MODES: readonly SharppromptMode[] = ['fill', 'replace', 'context', 'off']

const bag = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean))

// Word overlap of two texts, 0 to 1. Above EDIT_OVERLAP a prompt sent while
// our suggestion sits in the box counts as the suggestion, edited.
export function overlap(a: string, b: string): number {
  const x = bag(a)
  const y = bag(b)
  if (x.size === 0 && y.size === 0) return 1
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

export const EDIT_OVERLAP = 0.4

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
  if (!('rewrite' in d) || !d.rewrite) return `classified ${d.verdict}, sent as typed`
  const r = d.rewrite
  return `classified rough, rewrite ${r.outcome} via ${r.via} in ${r.ms} ms`
}
