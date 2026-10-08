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
function world(on: On, opts: { surface?: RenderSurface | null; fillOk?: boolean; label?: string } = {}) {
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
  on('model.fork', () => ({ value: answer(REWRITTEN) }))
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

test('band: three choices; r sends the original as typed, e puts it back raw', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sharpprompt', surface, ...BAND })
    expect((await ui.find({ type: 'Text', text: /Enter sends the rewrite/ }))).toBeDefined()
    expect((await ui.find({ key: 'edit' }))?.props.hotkey).toBe('e')
    expect((await ui.find({ key: 'raw' }))?.props.hotkey).toBe('r')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  expect(w.sent.at(-1)).toMatchObject({ text: ROUGH, origin: { kind: 'plugin', name: 'sharpprompt', asUser: true } })
  expect(await ui.find({ key: 'raw' })).toBeUndefined()
})

test('band: e puts the original back marked raw', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'edit' })
  expect(w.fills.at(-1)).toBe(`raw: ${ROUGH}`)
  const r = await $.prompt.submit({ text: `raw: ${ROUGH}`, ...typed })
  expect(r.text).toBe(ROUGH)
})

test('commands: off, status, mode, help', async ($, on) => {
  const w = world(on)
  expect((await $.command.run(cmd('sharpprompt', 'off'))).text).toContain('off')
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
