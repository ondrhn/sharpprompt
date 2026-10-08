import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'
import type { SharppromptDecision, SharppromptVerdict } from '../types'
import { endsWithQuestion, gate } from './gate'

// The engine checks that $ never leaves this file, so everything that calls
// it lives here and gate.ts stays pure.

const isOff = { plugin: 'sharpprompt', key: 'isOff' } as const
const lastDecision = { plugin: 'sharpprompt', key: 'lastDecision' } as const

export const CLASSIFY_MS = 2_500

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
  return { verdict: await classify($, e.text, model), text: e.text }
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
