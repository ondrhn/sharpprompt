import { describe, expect, test } from 'claude-code/testing'
import { endsWithQuestion, gate, MAX_CHARS, type GateInput } from '../hooks/gate'

const typed: GateInput['origin'] = { kind: 'composer' }
const long = 'refactor the session loader so it stops reading the whole file twice'
const base: GateInput = { text: long, origin: typed, minChars: 40, isOff: false }

describe('gate', () => {
  test('a long typed prompt goes on to the classifier', () => {
    expect(gate(base)).toEqual({ pass: false })
  })

  test('raw: is cut off and the rest goes out as typed, even when off', () => {
    expect(gate({ ...base, text: 'raw: fix it' })).toEqual({ pass: true, reason: 'raw', text: 'fix it' })
    expect(gate({ ...base, text: 'RAW:' + long, isOff: true })).toMatchObject({ reason: 'raw', text: long })
  })

  test('each skip rule names itself', () => {
    const cases: [Partial<GateInput>, string][] = [
      [{ isOff: true }, 'off'],
      [{ origin: { kind: 'peer' } }, 'not-typed'],
      [{ origin: { kind: 'task-notification' } }, 'not-typed'],
      [{ origin: { kind: 'plugin', name: 'other' } }, 'not-typed'],
      [{ text: '/compact keep the test list and drop the rest please' }, 'command'],
      [{ text: '  # remember that the tests run under bun, not node' }, 'heading'],
      [{ text: 'fix the test' }, 'too-short'],
      [{ text: 'x'.repeat(MAX_CHARS + 1) }, 'too-long'],
      [{ text: '<task-notification><task-id>b1</task-id> done and more text here' }, 'harness-tag'],
      [{ text: 'here it is <system-reminder>whatever the reminder said</system-reminder>' }, 'harness-tag'],
    ]
    for (const [over, reason] of cases) {
      const d = gate({ ...base, ...over })
      expect(d, JSON.stringify(over).slice(0, 60)).toMatchObject({ pass: true, reason })
    }
  })

  test('a bridge prompt counts as typed', () => {
    expect(gate({ ...base, origin: { kind: 'bridge' } })).toEqual({ pass: false })
  })

  test('minChars comes from the options', () => {
    expect(gate({ ...base, text: 'short but fine here', minChars: 10 })).toEqual({ pass: false })
  })
})

describe('endsWithQuestion', () => {
  test('reads through trailing markdown and whitespace', () => {
    expect(endsWithQuestion('Which one should I keep?')).toBe(true)
    expect(endsWithQuestion('Should I **delete the cache?**  \n')).toBe(true)
    expect(endsWithQuestion('Want me to run it (yes/no)?)')).toBe(true)
    expect(endsWithQuestion('Done. The tests pass.')).toBe(false)
    expect(endsWithQuestion('Is this right? I changed three files.')).toBe(false)
    expect(endsWithQuestion('')).toBe(false)
  })
})
