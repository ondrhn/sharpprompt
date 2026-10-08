import type { EngineInterface, ModelUsage, PromptSubmitInput, Register } from 'claude-code'
import type { SharppromptDecision, SharppromptRewrite, SharppromptVerdict } from '../types'
import { endsWithQuestion, gate } from './gate'
import { clean, completePrompt, familyOf, forkPrompt, type Exemplar, type Recent } from './rewrite'

// The engine checks that $ never leaves this file, so everything that calls
// it lives here and gate.ts stays pure.

const isOff = { plugin: 'sharpprompt', key: 'isOff' } as const
const lastDecision = { plugin: 'sharpprompt', key: 'lastDecision' } as const

export const CLASSIFY_MS = 2_500
export const REWRITE_MS = 5_000

// Tokens a fork spent after it lost its race: it finished in the background
// and was billed anyway. Read out by the stats in a later step.
export const late = { forks: 0, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }

function addLate(u: ModelUsage) {
  late.forks++
  late.usage.input_tokens += u.input_tokens
  late.usage.output_tokens += u.output_tokens
  late.usage.cache_read_input_tokens += u.cache_read_input_tokens
  late.usage.cache_creation_input_tokens += u.cache_creation_input_tokens
}

const TIMEOUT: unique symbol = Symbol('timeout')

// fork and classify take no time limit, so we race them against the clock.
// The loser keeps running: a fork that lost still finishes in the background
// and is billed (README, Limits).
async function race<T>($: EngineInterface, work: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  const stop = new AbortController()
  // A sleep that fails for its own reasons must not read as a timeout: the
  // work then runs unraced, and the engine's hook budget is the backstop.
  const timer: Promise<typeof TIMEOUT> = $.clock.sleep(ms, { signal: stop.signal }).then(
    () => TIMEOUT,
    () => new Promise<never>(() => {}),
  )
  try {
    return await Promise.race([work, timer])
  } finally {
    stop.abort()
  }
}

async function classify($: EngineInterface, text: string, model: string): Promise<SharppromptVerdict> {
  try {
    const label = await race($, $.model.classify(text, ['clear', 'rough'], { model }), CLASSIFY_MS)
    if (label === TIMEOUT) return 'timeout'
    if (label === 'clear' || label === 'rough') return label
    return 'error'
  } catch {
    return 'error'
  }
}

async function recent($: EngineInterface): Promise<Recent[]> {
  const rows = await $.session.messages()
  return rows
    .filter(r => r.text.trim() !== '')
    .slice(-4)
    .map(r => ({ role: r.role, text: r.text }))
}

async function exemplarsOf($: EngineInterface): Promise<Exemplar[]> {
  const v = await $.store.get('exemplars')
  return Array.isArray(v) ? (v as Exemplar[]) : []
}

// Fork first: it reads the conversation from the prompt cache. With nothing
// to fork yet (first turn, after /clear) a plain completion with the last few
// messages pasted in. Both race the clock; losing means no rewrite.
async function rewrite($: EngineInterface, draft: string): Promise<SharppromptRewrite> {
  const started = await $.clock.now()
  const family = familyOf(await $.session.model())
  const examples = await exemplarsOf($)
  const took = async () => (await $.clock.now()) - started

  const forking = $.model.fork({ prompt: forkPrompt(draft, family, examples) })
  const forked = await race($, forking, REWRITE_MS)
  if (forked === TIMEOUT) {
    void forking.then(r => ('usage' in r ? addLate(r.usage) : undefined), () => {})
    return { outcome: 'timeout', via: 'fork', ms: await took() }
  }

  let reply = forked
  let via: 'fork' | 'complete' = 'fork'
  if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
    via = 'complete'
    reply = await $.model.complete({
      model: await $.session.model(),
      prompt: completePrompt(draft, family, await recent($), examples),
      maxTokens: 600,
      effort: 'low',
      timeoutMs: REWRITE_MS,
    })
    if (!reply.isAnswered && reply.reason === 'aborted') return { outcome: 'timeout', via, ms: await took() }
  }
  if (!reply.isAnswered) return { outcome: 'error', via, ms: await took(), detail: reply.reason }

  const c = clean(reply.text, draft)
  const ms = await took()
  if ('rejected' in c) return { outcome: c.rejected, via, ms, usage: reply.usage }
  return { outcome: 'rewritten', via, ms, usage: reply.usage, text: c.rewritten }
}

async function lastReply($: EngineInterface): Promise<string> {
  const rows = await $.session.messages()
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.role === 'assistant' && row.text.trim() !== '') return row.text
  }
  return ''
}

// What sharpprompt would do with this prompt. Anything but 'rough' means the
// prompt goes out exactly as typed.
async function decide($: EngineInterface, e: PromptSubmitInput, options: Readonly<Record<string, unknown>>): Promise<SharppromptDecision> {
  const off = options.mode === 'off' || (await $.state.get(isOff)).value === true
  const g = gate({
    text: e.text,
    origin: e.origin,
    minChars: typeof options.minChars === 'number' ? options.minChars : 40,
    isOff: off,
  })
  if (g.pass) return { verdict: 'skip', reason: g.reason, text: g.text }

  if (endsWithQuestion(await lastReply($))) return { verdict: 'skip', reason: 'answer', text: e.text }

  const model = typeof options.optimizerModel === 'string' ? options.optimizerModel : 'haiku'
  const verdict = await classify($, e.text, model)
  if (verdict !== 'rough') return { verdict, text: e.text }
  return { verdict, text: e.text, rewrite: await rewrite($, e.text) }
}

// Whatever happens in here, the prompt goes out. A thrown error lands in
// .catch, which sends it untouched.
export const register: Register = (on, options) => {
  on('prompt.submit', async ($, e, next) => {
    const d = await decide($, e, options)
    await $.state.set(lastDecision, d)
    if (d.text !== e.text) return next({ ...e, text: d.text })
    // The rewrite and its delivery come in the next steps; until then a rough
    // prompt goes out as typed too.
    return next(e)
  }).catch(($, e, next) => next(e))
}
