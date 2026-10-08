import type { ModelCompleteResult, On, PromptSubmitResult, RenderSurface } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { DROP_NOTE } from '../hooks/flow'

const ROUGH = 'make the login thing work better its kinda broken when you do the thing'
const REWRITTEN = 'The login test fails since your session change. Find the cause and fix it; done when the auth tests pass.'
const typed = { wait: false, origin: { kind: 'composer' } } as const
const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answer = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage })

const cmd = (command: string, args: string) => ({
  command,
  args,
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 100 },
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {}, title: '', isFocused: false },
} as const

// The engine beneath the plugin, recording what reaches the model, the box
// and the bottom of prompt.submit.
function world(on: On, opts: { surface?: RenderSurface | null; fillOk?: boolean; label?: string; forkMs?: number } = {}) {
  const w = {
    sent: [] as { text: string; context?: readonly string[]; origin: unknown }[],
    fills: [] as string[],
    classify: 0,
    store: {} as Record<string, unknown>,
    clock: mock.clock(on),
  }
  // A store in memory that the test can read back.
  on('store.get', (_$, e) => ({ value: w.store[e.key] }))
  on('store.set', (_$, e) => {
    w.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  // What the engine draws when no plugin draws the band: an empty box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surface', () => ({ value: opts.surface === undefined ? 'terminal' : opts.surface }))
  on('session.messages', () => ({ value: [] }))
  on('model.classify', () => {
    w.classify++
    return { value: opts.label ?? 'rough' }
  })
  on('model.fork', async () => {
    if (opts.forkMs) await w.clock.sleep(opts.forkMs)
    return { value: answer(REWRITTEN) }
  })
  on('prompt.fill', (_$, e) => {
    w.fills.push(e.text)
    return opts.fillOk === false ? { isFilled: false, refusal: 'dialog' } : { isFilled: true }
  })
  on('prompt.submit', (_$, e): PromptSubmitResult => {
    w.sent.push({ text: e.text, context: e.context, origin: e.origin })
    return { text: e.text, context: e.context }
  })
  return w
}

test('fill: the rewrite goes in the box and the prompt is held back', async ($, on) => {
  const w = world(on)
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r).toEqual({ drop: DROP_NOTE })
  expect(w.fills).toEqual([REWRITTEN])
  expect(w.sent).toHaveLength(0)
})

test('fill: when the box cannot take it, the original goes out as typed', async ($, on) => {
  const w = world(on, { fillOk: false })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.sent).toEqual([{ text: ROUGH, context: undefined, origin: typed.origin }])
})

for (const surface of ['vscode', null] as const) {
  test(`fill on ${surface ?? 'a headless session'} falls back to context`, async ($, on) => {
    const w = world(on, { surface })
    await $.prompt.submit({ text: ROUGH, ...typed })
    expect(w.sent[0]?.text).toBe(ROUGH)
    expect(w.sent[0]?.context?.[0]).toContain(REWRITTEN)
    expect(w.fills).toHaveLength(0)
  })
}

test('context mode keeps the prompt and adds the rewrite beside it', { options: { mode: 'context' } }, async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.sent[0]?.text).toBe(ROUGH)
  expect(w.sent[0]?.context?.[0]).toContain(REWRITTEN)
})

test('replace mode sends the rewrite and keeps the original for undo', { options: { mode: 'replace' } }, async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.sent[0]?.text).toBe(REWRITTEN)
  const out = await $.command.run(cmd('sharp', 'undo'))
  expect(out.text).toContain('back in the prompt box')
  expect(w.fills.at(-1)).toBe(`raw: ${ROUGH}`)
})

test('sending the suggestion as is goes out untouched, no second rewrite', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const r = await $.prompt.submit({ text: REWRITTEN, ...typed })
  expect(r.text).toBe(REWRITTEN)
  expect(w.classify).toBe(1)
  expect(w.store.exemplars).toBeUndefined()
})

test('an edited suggestion is kept as an exemplar', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const edited = REWRITTEN.replace('auth tests pass', 'auth and session tests pass, no new deps')
  await $.prompt.submit({ text: edited, ...typed })
  expect(w.store.exemplars).toEqual([{ original: REWRITTEN, sent: edited }])
})

test('a different prompt after a suggestion is a new prompt', async ($, on) => {
  const w = world(on, { label: 'clear' })
  await $.prompt.submit({ text: ROUGH, ...typed }) // clear: no suggestion
  await $.prompt.submit({ text: 'completely unrelated question about the deploy pipeline and its caching', ...typed })
  expect(w.classify).toBe(2)
})

test('band: Enter, edit in the box, or r for the original', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sharpprompt', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Enter sends it, or edit it in the box/ })).toBeDefined()
    expect((await ui.find({ key: 'raw' }))?.props.hotkey).toBe('r')
    await ui.unmount()
  }
})

test('band: r puts the original back marked raw, and it then goes out as typed', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  expect(w.fills.at(-1)).toBe(`raw: ${ROUGH}`)
  expect(await ui.find({ key: 'raw' })).toBeUndefined()
  const r = await $.prompt.submit({ text: `raw: ${ROUGH}`, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.sent.at(-1)?.origin).toEqual({ kind: 'composer' })
  expect(w.store.counts).toMatchObject({ 'answer:original': 1, 'skip:raw': 1 })
})

test('commands: off, status, mode, help', async ($, on) => {
  const w = world(on)
  expect((await $.command.run(cmd('sharpprompt', 'off'))).text).toContain('Off for this session')
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.classify).toBe(0)
  expect((await $.command.run(cmd('sharp', 'status'))).text).toContain('passed untouched (off)')
  expect((await $.command.run(cmd('sharp', 'mode turbo'))).text).toContain('mode is one of')
  expect((await $.command.run(cmd('sharp', 'mode replace'))).text).toBe('Mode is replace for this session.')
})

test('try shows what a rewrite would be without sending anything', async ($, on) => {
  const w = world(on)
  const out = await $.command.run(cmd('sharp', `try ${ROUGH}`))
  expect(out.text).toContain('classify: rough')
  expect(out.text).toContain(REWRITTEN)
  expect(w.sent).toHaveLength(0)
})

test('a turn is recorded with how its prompt got there', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: REWRITTEN, ...typed })
  const turn = { turnId: 't1', durationMs: 4200, isAborted: false, reason: 'answer', answer: 'Done. Want me to push it?' } as const
  await $.turn.complete(turn)
  expect(w.store.turns).toEqual([{ prompt: 'rewritten', durationMs: 4200, tools: 0, asked: true, aborted: false }])
  await $.turn.complete(turn)
  expect(w.store.turns).toHaveLength(1)
  expect(w.store.counts).toMatchObject({ 'verdict:rough': 1, 'answer:as-is': 1 })
  expect(w.store.rewrites).toEqual([{ outcome: 'rewritten', via: 'fork', ms: 0, classifyMs: 0, usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 } }])
})

test('stats prints a summary and says when n is too small', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const out = (await $.command.run(cmd('sharp', 'stats'))).text ?? ''
  expect(out).toContain('Classified: clear 0, rough 1')
  expect(out).toContain('fork 0 / 0 ms (n=1)')
  expect(out).toContain('Too few turns to compare yet')
})

test('a fork that loses the race is still counted once it finishes', async ($, on) => {
  const w = world(on, { forkMs: 6_000 })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  const pending = $.prompt.submit({ text: ROUGH, ...typed })
  await w.clock.settle()
  await w.clock.advance(5_000)
  expect((await pending).text).toBe(ROUGH)
  await w.clock.advance(1_000)
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect(w.store.counts).toMatchObject({ 'late:forks': 1, 'late:output': 20, 'late:input': 10 })
  expect(w.store.rewrites).toEqual([expect.objectContaining({ outcome: 'timeout', via: 'fork' })])
})
