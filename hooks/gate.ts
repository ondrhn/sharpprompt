import type { PromptOrigin } from 'claude-code'
import type { SharppromptSkip } from '../types'

// The cheap part of the decision: no model, no awaits. Anything this lets
// through still has to be called rough by the classifier before we touch it.

export type GateInput = {
  text: string
  origin: PromptOrigin
  minChars: number
  isOff: boolean
}

export type GateDecision =
  | { pass: true; reason: SharppromptSkip; text: string }
  | { pass: false }

export const MAX_CHARS = 20_000

const RAW_PREFIX = /^raw:\s?/i
const HARNESS_TAG = /<(task-notification|system-reminder|command-[a-z-]+|local-command-[a-z-]+)[\s>]/

// Only what a person typed (or sent from their phone) is ours to look at.
const TYPED: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge'])

export function gate(input: GateInput): GateDecision {
  const { text, origin, minChars, isOff } = input
  const pass = (reason: SharppromptSkip, out = text): GateDecision => ({ pass: true, reason, text: out })

  if (!TYPED.has(origin.kind)) return pass('not-typed')
  if (RAW_PREFIX.test(text)) return pass('raw', text.replace(RAW_PREFIX, ''))
  if (isOff) return pass('off')

  const trimmed = text.trim()
  if (trimmed.startsWith('/')) return pass('command')
  if (trimmed.startsWith('#')) return pass('heading')
  if (trimmed.length < minChars) return pass('too-short')
  if (trimmed.length > MAX_CHARS) return pass('too-long')
  if (HARNESS_TAG.test(trimmed)) return pass('harness-tag')

  return { pass: false }
}

// When Claude's last reply ended on a question, the next prompt is almost
// always the answer to it, and rewriting an answer only gets in the way.
export function endsWithQuestion(reply: string): boolean {
  const tail = reply.trimEnd().replace(/[*_`)\]"'”’»\s]+$/u, '')
  return tail.endsWith('?') || tail.endsWith('？')
}
