import type { SessionMessage } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { sessionFacts } from '../hooks/facts'

let n = 0
const tool = (name: string, input: Record<string, unknown>, text = '', isError?: true) => ({ tool_use_id: `t${n++}`, tool: name, input, text, ...(isError ? { isError } : {}) })
const said = (text: string, toolUses: SessionMessage['toolUses'] = []): SessionMessage => ({ role: 'assistant', text, toolUses })

describe('sessionFacts', () => {
  test('lists files read and changed; a changed file is not also listed as read', () => {
    const f = sessionFacts([
      said('', [tool('Read', { file_path: 'calc.py' }), tool('Read', { file_path: 'export.py' })]),
      said('', [tool('Edit', { file_path: 'calc.py' })]),
    ])
    expect(f).toContain('Files changed this session: calc.py')
    expect(f).toContain('Files read this session: export.py')
  })
  test('keeps the last failed command and the end of its output', () => {
    const f = sessionFacts([said('', [tool('Bash', { command: 'python3 run_tests.py' }, 'ok a\nFAIL test_days_in_month\nAssertionError', true)])])
    expect(f).toContain('Last command failed: python3 run_tests.py')
    expect(f).toContain('FAIL test_days_in_month')
  })
  test('a later passing command clears the failure', () => {
    const f = sessionFacts([
      said('', [tool('Bash', { command: 'python3 run_tests.py' }, 'FAIL x', true)]),
      said('', [tool('Bash', { command: 'python3 run_tests.py' }, '0 failed')]),
    ])
    expect(f).not.toContain('Last command failed')
  })
  test("starts Claude's last reply and stays short", () => {
    const f = sessionFacts([said('First reply.'), said('The leap year bug is in dates.py. '.repeat(40))])
    expect(f).toContain("Claude's last reply began: The leap year bug is in dates.py.")
    expect(f.length).toBeLessThanOrEqual(1203)
  })
  test('nothing to say for an empty session', () => {
    expect(sessionFacts([])).toBe('')
  })
})
