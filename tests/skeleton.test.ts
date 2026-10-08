import { test, expect } from 'claude-code/testing'

test('a prompt passes through untouched', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const r = await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
  expect(r.text).toBe('hello there')
})
