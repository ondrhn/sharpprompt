import type { ModelCompleteResult, On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ROUGH = 'make the login thing work better its kinda broken when you do the thing'
const typed = { wait: false, origin: { kind: 'composer' } } as const

// The engine beneath the plugin: the session's rows, the classifier, and the
// bottom of prompt.submit, which echoes what entered.
type Reply = ModelCompleteResult | { isAnswered: false; reason: 'nothing-to-fork' } | 'hang'
const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answer = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage })
const REWRITTEN = 'The login test fails since your session change. Find the cause and fix it; done when the auth tests pass.'

function world(
  on: On,
  opts: { rows?: SessionMessage[]; label?: string | 'hang' | 'throw'; fork?: Reply; complete?: ModelCompleteResult | 'hang' } = {},
) {
  const calls = { classify: 0, fork: 0, complete: 0, prompts: [] as string[], decisions: [] as any[], clock: mock.clock(on) }
  mock.store(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.fork', (_$, e) => {
    calls.fork++
    calls.prompts.push(e.prompt)
    const r = opts.fork ?? answer(REWRITTEN)
    return r === 'hang' ? new Promise<never>(() => {}) : { value: r }
  })
  on('model.complete', (_$, e) => {
    calls.complete++
    calls.prompts.push(e.prompt)
    const r = opts.complete ?? answer(REWRITTEN)
    return r === 'hang' ? new Promise<never>(() => {}) : { value: r }
  })
  on('session.messages', () => ({ value: opts.rows ?? [] }))
  on('model.classify', async () => {
    calls.classify++
    if (opts.label === 'throw') throw new Error('api down')
    if (opts.label === 'hang') return new Promise<never>(() => {})
    return { value: opts.label ?? 'rough' }
  })
  on('state.set', (_$, e, next) => {
    if (e.plugin === 'sharpprompt' && e.key === 'lastDecision') calls.decisions.push(e.value)
    return next(e)
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  return calls
}

const reply = (text: string): SessionMessage => ({ role: 'assistant', text, toolUses: [] })

test('a rough prompt is classified and, for now, goes out as typed', async ($, on) => {
  const calls = world(on, { label: 'rough' })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(calls.classify).toBe(1)
  expect(calls.decisions.at(-1)).toMatchObject({ verdict: 'rough', text: ROUGH, rewrite: { outcome: 'rewritten', via: 'fork', text: REWRITTEN } })
  expect(calls.fork).toBe(1)
  expect(calls.complete).toBe(0)
})

test('with nothing to fork, the rewrite falls back to a completion', async ($, on) => {
  const calls = world(on, { fork: { isAnswered: false, reason: 'nothing-to-fork' } })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(calls.complete).toBe(1)
  expect(calls.decisions.at(-1)?.rewrite).toMatchObject({ outcome: 'rewritten', via: 'complete' })
})

test('a fork that hangs past 5 s gives up and the prompt goes out as typed', async ($, on) => {
  const calls = world(on, { fork: 'hang' })
  const pending = $.prompt.submit({ text: ROUGH, ...typed })
  await calls.clock.settle()
  await calls.clock.advance(4_999)
  expect(calls.decisions).toHaveLength(0)
  await calls.clock.advance(1)
  const r = await pending
  expect(r.text).toBe(ROUGH)
  expect(calls.decisions.at(-1)?.rewrite).toMatchObject({ outcome: 'timeout', via: 'fork' })
})

test('a completion cut off by its own time limit counts as a timeout', async ($, on) => {
  const calls = world(on, {
    fork: { isAnswered: false, reason: 'nothing-to-fork' },
    complete: { isAnswered: false, reason: 'aborted', usage },
  })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(calls.decisions.at(-1)?.rewrite).toMatchObject({ outcome: 'timeout', via: 'complete' })
})

test('KEEP from the model means no rewrite', async ($, on) => {
  const calls = world(on, { fork: answer('KEEP') })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(calls.decisions.at(-1)?.rewrite).toMatchObject({ outcome: 'keep' })
})

test('the rewrite prompt uses the session model\'s rules', async ($, on) => {
  const calls = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(calls.prompts[0]).toContain('Opus 5 verifies on its own')
})

test('an answer to Claude\'s question is never classified', async ($, on) => {
  const calls = world(on, {
    rows: [reply('I found two configs.'), { role: 'user', text: 'ok', toolUses: [] }, reply('Which one should I keep, the old or the new?')],
  })
  const r = await $.prompt.submit({ text: 'the new one, and delete the old file together with its tests', ...typed })
  expect(r.text).toBe('the new one, and delete the old file together with its tests')
  expect(calls.classify).toBe(0)
  expect(calls.decisions.at(-1)).toMatchObject({ verdict: 'skip', reason: 'answer' })
})

test('a tool-only assistant row does not hide the question before it', async ($, on) => {
  const calls = world(on, { rows: [reply('Should I push it?'), { role: 'assistant', text: '', toolUses: [] }] })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(calls.classify).toBe(0)
})

test('a classifier that hangs past 2.5 s lets the prompt through as typed', async ($, on) => {
  const calls = world(on, { label: 'hang' })
  const clock = calls.clock
  const pending = $.prompt.submit({ text: ROUGH, ...typed })
  await clock.advance(2_499)
  await clock.advance(1)
  const r = await pending
  expect(r.text).toBe(ROUGH)
  expect(calls.classify).toBe(1)
  expect(calls.decisions.at(-1)).toMatchObject({ verdict: 'timeout' })
})

test('a classifier error lets the prompt through as typed', async ($, on) => {
  const calls = world(on, { label: 'throw' })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(calls.decisions.at(-1)).toMatchObject({ verdict: 'error' })
})

test('a label outside clear/rough counts as an error', async ($, on) => {
  const calls = world(on, { label: 'maybe' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(calls.decisions.at(-1)).toMatchObject({ verdict: 'error' })
})

test('raw: goes out without its prefix and without a model call', async ($, on) => {
  const calls = world(on)
  const r = await $.prompt.submit({ text: 'raw: ' + ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(calls.classify).toBe(0)
})

test('mode off sends everything as typed', { options: { mode: 'off' } }, async ($, on) => {
  const calls = world(on)
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(calls.classify).toBe(0)
})

test('a broken session read still lets the prompt through', async ($, on) => {
  on('session.messages', () => {
    throw new Error('boom')
  })
  on('model.classify', () => ({ value: 'clear' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
})

test('a peer message is left alone', async ($, on) => {
  const calls = world(on)
  const r = await $.prompt.submit({ text: ROUGH, wait: false, origin: { kind: 'peer' } })
  expect(r.text).toBe(ROUGH)
  expect(calls.classify).toBe(0)
})
