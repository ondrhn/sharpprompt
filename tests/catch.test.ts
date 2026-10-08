import { expect, mock, test } from 'claude-code/testing'

const ROUGH = 'make the login thing work better its kinda broken when you do the thing'
const typed = { wait: false, origin: { kind: 'composer' } } as const

// The .catch on prompt.submit must never send a prompt twice. There is no
// `next.called` check in register.ts because the engine already does it; its
// Caught type says: "There `next` is replay-safe: when `called`, `next(e)`
// resolves to what the hook's last call settled to, nothing beneath running
// again, the argument unread; when not, it runs the hooks beneath once and a
// later call replays." These tests hold the engine to that.

test('a hook that fails before next sends the prompt once', async ($, on) => {
  mock.clock(on)
  let sent = 0
  on('session.messages', () => {
    throw new Error('boom')
  })
  on('prompt.submit', (_$, e) => {
    sent++
    return { text: e.text }
  })
  const r = await $.prompt.submit({ text: ROUGH, ...typed })
  expect(r.text).toBe(ROUGH)
  expect(sent).toBe(1)
})

test('when the chain below throws after next, nothing is sent again', async ($, on) => {
  mock.clock(on)
  let sent = 0
  on('session.messages', () => ({ value: [] }))
  on('model.classify', () => ({ value: 'clear' }))
  on('prompt.submit', () => {
    sent++
    throw new Error('below broke')
  })
  await $.prompt.submit({ text: ROUGH, ...typed }).catch(() => undefined)
  expect(sent).toBe(1)
})
