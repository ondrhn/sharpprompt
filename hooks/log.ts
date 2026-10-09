import type { SharppromptDecision, SharppromptQuestion } from '../types'
import type { TurnRecord } from './stats'

// The usage log: for every prompt that went to the rewriter, the texts and
// what the user did with the result. It lives in $.store on the user's
// machine, nothing sends it anywhere, and scripts/export_log.mjs copies it
// out when the user asks. userConfig `log: false` turns it off.

export type LogAction =
  // Sent the rewrite unchanged, sent it after editing, put their own text
  // back, or typed something else while it waited.
  'as-is' | 'edited' | 'original' | 'abandoned'

export type LogRecord = {
  id: string
  at: string
  model?: string
  draft: string
  verdict: string
  classifyMs?: number
  outcome: string
  via: 'fork' | 'complete'
  ms: number
  rewrite?: string
  questions?: { question: string; options: string[] }[]
  // The labels picked, or 'dismissed' when a dialog was closed.
  answers?: Record<string, string> | 'dismissed'
  // How the result went out: in the box (fill), sent for the user (replace),
  // as context, or not at all (typed: the draft went as it was).
  delivered?: 'fill' | 'replace' | 'context' | 'typed'
  // The text put in the box or sent, after the answers were added.
  boxed?: string
  action?: LogAction
  // What the user sent instead, when they edited it.
  sent?: string
  // The turn the prompt started, as /sharp stats keeps it.
  turn?: Omit<TurnRecord, 'prompt' | 'usage'>
}

export const MAX_LOG = 300

// The store holds 4 MiB of JSON in all; one very long paste must not crowd
// out the rest.
export const MAX_TEXT = 2_000
export const clip = (t: string) => (t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}...` : t)

export function newRecord(id: string, at: string, model: string | undefined, d: SharppromptDecision): LogRecord | null {
  if (!('rewrite' in d) || !d.rewrite) return null
  const r = d.rewrite
  return {
    id,
    at,
    ...(model ? { model } : {}),
    draft: clip(d.text),
    verdict: d.verdict,
    ...(d.classifyMs === undefined ? {} : { classifyMs: d.classifyMs }),
    outcome: r.outcome,
    via: r.via,
    ms: r.ms,
    ...(r.text ? { rewrite: clip(r.text) } : {}),
    ...(r.questions?.length ? { questions: r.questions.map((q: SharppromptQuestion) => ({ question: q.question, options: q.options.map(o => o.label) })) } : {}),
  }
}

// Applies a change to one record; a record that fell off the end is left alone.
export function patchLog(list: readonly LogRecord[], id: string, patch: Partial<LogRecord>): LogRecord[] {
  return list.map(r => (r.id === id ? { ...r, ...patch } : r))
}

export function logLine(on: boolean, n: number): string {
  return on ? `Log: ${n} records, on this machine only (scripts/export_log.mjs copies them out).` : 'Log: off.'
}
