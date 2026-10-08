import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ROUGH = 'make the login thing work better its kinda broken when you do the thing'
const typed = { wait: false, origin: { kind: 'composer' } } as const

// The engine beneath the plugin: the session's rows, the classifier, and the
// bottom of prompt.submit, which echoes what entered.
function world(on: On, opts: { rows?: SessionMessage[]; label?: string | 'hang' | 'throw' } = {}) {
  const calls = { classify: 0, decisions: [] as unknown[], clock: mock.clock(on) }
  on('session.messages', () => ({ value: opts.rows ?? [] }))
  on('model.classify', async () => {
    calls.classify++
    if (opts.label === 'throw') throw new Error('api down')
    if (opts.label === 'hang') return new Promise<never>(() => {})
    return { value: opts.label ?? 'rough' }
  })
  on('state.set', (_$, e, next) => {
    if (e.plugin === 'promptgate' && e.key === 'lastDecision') calls.decisions.push(e.value)
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
  expect(calls.decisions.at(-1)).toEqual({ verdict: 'rough', text: ROUGH })
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
  on('model.classify', () => ({ value: 'rough' }))
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
