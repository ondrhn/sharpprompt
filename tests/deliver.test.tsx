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

const LABELS: Record<string, string> = { clear: 'clear and specific', rough: 'rough: vague or missing what to deliver' }

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {}, title: '', isFocused: false },
} as const

// The engine beneath the plugin, recording what reaches the model, the box
// and the bottom of prompt.submit.
function world(
  on: On,
  opts: { surface?: RenderSurface | null; fillOk?: boolean; label?: string; forkMs?: number; box?: (fills: string[]) => string; fork?: string; ask?: Record<string, string> | 'dismiss'; storeFull?: boolean; forkAborted?: boolean } = {},
) {
  const w = {
    sent: [] as { text: string; context?: readonly string[]; origin: unknown }[],
    fills: [] as string[],
    classify: 0,
    store: {} as Record<string, unknown>,
    forkPrompts: [] as string[],
    asked: [] as unknown[],
    clock: mock.clock(on),
  }
  // A store in memory that the test can read back.
  on('store.get', (_$, e) => ({ value: w.store[e.key] }))
  on('store.set', (_$, e) => {
    if (opts.storeFull) throw new Error('store is full')
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
    return { value: LABELS[opts.label ?? 'rough'] ?? opts.label }
  })
  on('model.fork', async (_$, e) => {
    w.forkPrompts.push(e.prompt)
    if (opts.forkMs) await w.clock.sleep(opts.forkMs)
    if (opts.forkAborted) return { value: { isAnswered: false, reason: 'aborted', usage } }
    return { value: answer(opts.fork ?? REWRITTEN) }
  })
  // $.ui.ask is a tool.call of AskUserQuestion beneath the plugin.
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    w.asked.push(e)
    if (opts.ask === 'dismiss') throw new Error('dismissed')
    const q = (e as unknown as { questions: { question: string }[] }).questions[0]!.question
    return { result: { questions: [], answers: { [q]: opts.ask?.[q] ?? '' } } } as never
  })
  on('prompt.read', () => ({ value: { text: opts.box ? opts.box(w.fills) : (w.fills.at(-1) ?? ''), cursor: 0 } }))
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
  expect(w.fills.at(-1)).toBe(ROUGH)
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
    expect((await ui.find({ key: 'raw' }))?.props.action).toBe('app:cycleDiffBase')
    await ui.unmount()
  }
})

test('band: what the rewrite added that the draft did not have is named', async ($, on) => {
  world(on, { fork: 'Push 032f1ad and check the login test in tests/auth.test.ts.' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /not in your draft: tests\/auth\.test\.ts, 032f1ad/ })).toBeDefined()
  await ui.unmount()
})

test('band: r puts the original back as typed, and sent unchanged it goes out untouched', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  expect(w.fills.at(-1)).toBe(ROUGH)
  expect(await ui.find({ key: 'raw' })).toBeUndefined()
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.classify).toBe(1)
  expect(w.sent.at(-1)?.origin).toEqual({ kind: 'composer' })
  expect(w.store.counts).toMatchObject({ 'answer:original': 1, 'skip:back-to-mine': 1 })
})

test('band: the original put back and then edited is still the user own, sent untouched', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  let ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /your own prompt is back in the box/ })).toBeDefined()
  await ui.unmount()
  const edited = ROUGH + ' and also check the logout path please'
  const r = await $.prompt.submit({ text: edited, ...typed })
  expect(r.text).toBe(edited)
  expect(w.classify).toBe(1)
})

test('band: a different prompt after the original was put back is a new prompt', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await $.prompt.submit({ text: 'completely unrelated question about the deploy pipeline and its caching', ...typed })
  expect(w.classify).toBe(2)
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
  expect(w.store.rewrites).toEqual([{ outcome: 'rewritten', via: 'fork', ms: 0, classifyMs: 0, usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 }, replyChars: REWRITTEN.length, words: [14, 20], model: 'claude-opus-5-5', at: w.clock.now() }])
  expect(w.store.decisions).toEqual([{ at: w.clock.now(), key: 'verdict:rough' }])
})

test('stats prints a summary and says when n is too small', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const out = (await $.command.run(cmd('sharp', 'stats'))).text ?? ''
  expect(out).toContain('Classified: clear 0, rough 1')
  expect(out).toContain('classify 0 / 0 ms (n=1), fork 0 / 0 ms (n=1)')
  expect(out).toContain('Too few turns to compare yet')
})

test('a fork that loses the race is still counted once it finishes', async ($, on) => {
  const w = world(on, { forkMs: 11_000 })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  const pending = $.prompt.submit({ text: ROUGH, ...typed })
  await w.clock.settle()
  await w.clock.advance(10_000)
  expect((await pending).text).toBe(ROUGH)
  await w.clock.advance(1_000)
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect(w.store.counts).toMatchObject({ 'late:forks': 1, 'late:output': 20, 'late:input': 10 })
  expect(w.store.rewrites).toEqual([expect.objectContaining({ outcome: 'timeout', via: 'fork' })])
  expect(w.store.late).toEqual([{ at: w.clock.now(), forks: 1, ms: [11_000], model: 'claude-opus-5-5', usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 } }])
})

test('classify time is kept for clear prompts too', async ($, on) => {
  const w = world(on, { label: 'clear' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.store.classified).toEqual([{ verdict: 'clear', ms: 0, words: 14, at: w.clock.now(), model: 'haiku' }])
  expect(w.store.rewrites).toBeUndefined()
})

test('when Claude Code puts the dropped prompt back under the rewrite, the rewrite is set alone again', async ($, on) => {
  const w = world(on, { box: fills => (fills.length === 1 ? `${REWRITTEN}\n${ROUGH}` : fills.at(-1)!) })
  await $.prompt.submit({ text: ROUGH, ...typed })
  await w.clock.settle()
  expect(w.fills).toEqual([REWRITTEN, REWRITTEN])
})

test('a box that already holds the rewrite alone is not filled again', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await w.clock.settle()
  expect(w.fills).toEqual([REWRITTEN])
})

test('rewriteLanguage en reaches the rewrite prompt; the default does not', { options: { rewriteLanguage: 'en' } }, async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.forkPrompts[0]).toContain('Write the rewrite in English')
})

test('by default the rewrite keeps the user language', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.forkPrompts[0]).not.toContain('Write the rewrite in English')
})

const SEP = 'Which separator should the CSV use?'
const WITH_QUESTION = `${REWRITTEN}\nQUESTIONS: ${JSON.stringify([{ question: SEP, header: 'Separator', options: [{ label: 'Semicolon', adds: 'Use a semicolon as the separator.' }, { label: 'Comma', adds: 'Keep the comma.' }] }])}`

test('a rewrite with a question asks it and adds the answer', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: { [SEP]: 'Comma' } })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.asked).toHaveLength(1)
  expect(w.fills[0]).toBe(`${REWRITTEN} Keep the comma.`)
  expect(w.forkPrompts[0]).toContain('QUESTIONS:')
})

test('closing the dialog sends the prompt as typed', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: 'dismiss' })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.fills).toHaveLength(0)
  expect(w.store.counts).toMatchObject({ 'ask:dismissed': 1 })
})

test('with no dialog to show, the recommended answers are used', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, surface: 'vscode' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.asked).toHaveLength(0)
  expect(w.sent[0]?.context?.[0]).toContain(`${REWRITTEN} Use a semicolon as the separator.`)
})

test('askBeforeSend off: no question instructions and no dialog', { options: { askBeforeSend: false } }, async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.forkPrompts[0]).not.toContain('QUESTIONS:')
  expect(w.asked).toHaveLength(0)
})

test('session facts reach the rewrite prompt unless turned off', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  // The test session has no rows, so no facts block.
  expect(w.forkPrompts[0]).not.toContain('<session_facts>')
})

// The usage log: one record per rewrite, filled in as the user acts on it.
const TURN = { turnId: 't1', durationMs: 4200, isAborted: false, reason: 'answer', answer: 'Done.' } as const
const logOf = (w: { store: Record<string, unknown> }) => (w.store.log ?? []) as Record<string, unknown>[]

test('log: a rewrite sent as is, with the turn it started', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: REWRITTEN, ...typed })
  await $.turn.complete(TURN)
  expect(logOf(w)).toHaveLength(1)
  expect(logOf(w)[0]).toMatchObject({ model: 'claude-opus-5-5', draft: ROUGH, verdict: 'rough', outcome: 'rewritten', via: 'fork', rewrite: REWRITTEN, replyChars: REWRITTEN.length, delivered: 'fill', boxed: REWRITTEN, fillMs: 0, action: 'as-is', turn: { durationMs: 4200, tools: 0, asked: false, aborted: false } })
  expect(typeof logOf(w)[0]?.at).toBe('string')
})

test('log: an edited rewrite keeps what was sent', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const edited = REWRITTEN.replace('auth tests pass', 'auth and session tests pass, no new deps')
  await $.prompt.submit({ text: edited, ...typed })
  expect(logOf(w)[0]).toMatchObject({ action: 'edited', sent: edited })
})

test('log: r marks the original, and the turn after it is linked', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.turn.complete(TURN)
  expect(logOf(w)).toHaveLength(1)
  expect(logOf(w)[0]).toMatchObject({ action: 'original', turn: { durationMs: 4200 } })
})

test('log: typing something else while the rewrite waits marks it abandoned', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: 'completely unrelated question about the deploy pipeline and its caching layer', ...typed })
  expect(logOf(w)[0]).toMatchObject({ action: 'abandoned' })
  expect(logOf(w)).toHaveLength(2)
})

test('log: questions, answers and the text that went in the box', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: { [SEP]: 'Comma' } })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(logOf(w)[0]).toMatchObject({ questions: [{ question: SEP, options: ['Semicolon', 'Comma'] }], answers: { [SEP]: 'Comma' }, boxed: `${REWRITTEN} Keep the comma.` })
})

test('log: a closed dialog is recorded and the draft went as typed', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: 'dismiss' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(logOf(w)[0]).toMatchObject({ answers: 'dismissed', delivered: 'typed' })
})

test('log: stats counts the records', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect((await $.command.run(cmd('sharp', 'stats'))).text).toContain('Log: 1 records')
})

test('log off: nothing is kept and stats says so', { options: { log: false } }, async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: REWRITTEN, ...typed })
  expect(w.store.log).toBeUndefined()
  expect((await $.command.run(cmd('sharp', 'stats'))).text).toContain('Log: off.')
})

test('a full store costs no rewrite: the stats are lost, the suggestion is not', async ($, on) => {
  const w = world(on, { storeFull: true })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r).toEqual({ drop: DROP_NOTE })
  expect(w.fills).toEqual([REWRITTEN])
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
})

test('raw: in front of the suggestion sends the suggestion without the prefix', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const r = await $.prompt.submit({ text: `raw: ${REWRITTEN}`, ...typed })
  expect(r.text).toBe(REWRITTEN)
  expect(w.classify).toBe(1)
  expect(w.store.exemplars).toBeUndefined()
  expect(w.store.counts).toMatchObject({ 'answer:as-is': 1 })
})

test('replace mode: the band of a sent rewrite goes with the next prompt', { options: { mode: 'replace' } }, async ($, on) => {
  world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  let ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'undo' })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'thanks', ...typed })
  ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('replace mode with nobody to ask: the guessed answers go as context, the prompt as typed', { options: { mode: 'replace' } }, async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, surface: 'vscode' })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.sent[0]?.text).toBe(ROUGH)
  expect(w.sent[0]?.context?.[0]).toContain(`${REWRITTEN} Use a semicolon as the separator.`)
})

test('on after mode off turns rewriting back on', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('sharp', 'mode off'))
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.classify).toBe(0)
  await $.command.run(cmd('sharp', 'on'))
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.classify).toBe(1)
})

test('Esc during the wait: the draft put back goes out untouched, with no second rewrite', async ($, on) => {
  const w = world(on, { forkAborted: true })
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.store.rewrites).toEqual([expect.objectContaining({ outcome: 'aborted' })])
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.classify).toBe(1)
  expect(w.forkPrompts).toHaveLength(1)
})

test('text typed in the box during the wait is not wiped: the prompt goes as typed', async ($, on) => {
  const w = world(on, { box: () => 'also check the logout path' })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.fills).toHaveLength(0)
})

test('a prompt typed over a running turn leaves that turn its record', async ($, on) => {
  const w = world(on, { label: 'clear' })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: 'and the logout path too', ...typed, turnId: 't1' })
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect(w.store.turns).toEqual([expect.objectContaining({ prompt: 'typed', durationMs: 1000 })])
})

test('a question the dialog cannot show turns the rewrite down: its point is not in the body', async ($, on) => {
  const long = [{ question: 'Which separator?', header: 'Separator', options: [{ label: 'Semicolon', adds: 'x'.repeat(201) }, { label: 'Comma', adds: 'Keep the comma.' }] }]
  const w = world(on, { fork: `${REWRITTEN}\nQUESTIONS: ${JSON.stringify(long)}` })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.fills).toHaveLength(0)
  expect(w.store.rewrites).toEqual([expect.objectContaining({ outcome: 'error' })])
})

test('a value from the draft that the rewrite asks about is not lost', async ($, on) => {
  const draft = 'the fetch in api.ts keeps failing on flaky wifi, make it retry 3 or 5 times before it gives up'
  const q = [{ question: 'How many retries?', header: 'Retries', options: [{ label: '3', adds: 'Retry 3 times.' }, { label: '5', adds: 'Retry 5 times.' }] }]
  const w = world(on, { fork: `Make the fetch in api.ts retry before giving up, so it survives flaky wifi.\nQUESTIONS: ${JSON.stringify(q)}`, ask: { 'How many retries?': '5' } })
  await $.prompt.submit({ text: draft, ...typed })
  expect(w.asked).toHaveLength(1)
  expect(w.fills[0]).toBe('Make the fetch in api.ts retry before giving up, so it survives flaky wifi. Retry 5 times.')
})

test('KEEP in bold is no rewrite', async ($, on) => {
  const w = world(on, { fork: '**KEEP**' })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(w.fills).toHaveLength(0)
})

test('on after mode off brings back the configured mode', { options: { mode: 'replace' } }, async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('sharp', 'mode off'))
  await $.command.run(cmd('sharp', 'on'))
  await $.prompt.submit({ text: ROUGH, ...typed })
  expect(w.sent[0]?.text).toBe(REWRITTEN)
})

test('band: a value picked in the dialog is not named as new', async ($, on) => {
  const q = [{ question: 'How many retries?', header: 'Retries', options: [{ label: '30', adds: 'Retry 30 times.' }, { label: '50', adds: 'Retry 50 times.' }] }]
  world(on, { fork: `${REWRITTEN}\nQUESTIONS: ${JSON.stringify(q)}`, ask: { 'How many retries?': '50' } })
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /not in your draft/ })).toBeUndefined()
  await ui.unmount()
})

test('our own question dialog is not counted as a tool call of the turn', async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: { [SEP]: 'Comma' } })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: w.fills[0]!, ...typed })
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect(w.store.turns).toEqual([expect.objectContaining({ tools: 0 })])
})

test('back to mine, then a sentence added: still the user own text', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await ui.unmount()
  const more = `${ROUGH}. after the token refresh users get kicked out to the start page and lose their unsaved form data, see auth.ts`
  expect((await $.prompt.submit({ text: more, ...typed })).text).toBe(more)
  expect(w.classify).toBe(1)
})

test('raw: in front of the user own text put back is taken off', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await ui.unmount()
  expect((await $.prompt.submit({ text: `raw: ${ROUGH}`, ...typed })).text).toBe(ROUGH)
  expect(w.store.counts).toMatchObject({ 'skip:back-to-mine': 1 })
})

test('replace mode: our dialog is not a tool call of the turn', { options: { mode: 'replace' } }, async ($, on) => {
  const w = world(on, { fork: WITH_QUESTION, ask: { [SEP]: 'Comma' } })
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.turn.complete({ turnId: 't1', durationMs: 1000, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect(w.asked).toHaveLength(1)
  expect(w.store.turns).toEqual([expect.objectContaining({ tools: 0 })])
})

test('undo after the rewrite was sent leaves its record alone', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: REWRITTEN, ...typed })
  await $.command.run(cmd('sharp', 'undo'))
  expect((w.store.log as { action?: string }[]).at(-1)?.action).toBe('as-is')
})

test('replace mode: /sharp undo after the turn leaves that turn on its record', { options: { mode: 'replace' } }, async ($, on) => {
  const w = world(on)
  on('turn.complete', (_$, e) => ({ text: e.answer, reason: 'answer' as const }))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.turn.complete({ turnId: 't1', durationMs: 4200, isAborted: false, reason: 'answer', answer: 'ok.' })
  await $.command.run(cmd('sharp', 'undo'))
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.turn.complete({ turnId: 't2', durationMs: 999, isAborted: false, reason: 'answer', answer: 'ok.' })
  expect((w.store.log as { turn?: { durationMs: number } }[])[0]?.turn?.durationMs).toBe(4200)
})

test('undo after the suggestion was answered counts nothing twice', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: REWRITTEN, ...typed })
  await $.command.run(cmd('sharp', 'undo'))
  expect(w.store.counts).toMatchObject({ 'answer:as-is': 1 })
  expect(w.store.counts).not.toHaveProperty('answer:original')
})

test('a prompt starting with a path is text, not a command: the waiting suggestion is settled', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  await $.prompt.submit({ text: '/etc/nginx/nginx.conf has a typo on line 12 that breaks the reload, fix it please', ...typed })
  expect((w.store.log as { action?: string }[])[0]?.action).toBe('abandoned')
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'raw' })).toBeUndefined()
  await ui.unmount()
})

test('back to mine, then trimmed: still the user own text', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await ui.unmount()
  await $.prompt.submit({ text: 'make the login work, its broken when i log out', ...typed })
  expect(w.classify).toBe(1)
})

test('back to mine, then a different prompt: it is new', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: ROUGH, ...typed })
  const ui = await $.ui.mount({ plugin: 'sharpprompt', surface: 'terminal', ...BAND })
  await ui.press({ key: 'raw' })
  await ui.unmount()
  await $.prompt.submit({ text: 'when you do a release, the thing that builds the docs is broken: make it work with the new sidebar and do not touch the login page', ...typed })
  expect(w.classify).toBe(2)
})


