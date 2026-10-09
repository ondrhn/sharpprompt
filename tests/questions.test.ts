import { describe, expect, test } from 'claude-code/testing'
import { applyAnswers, askInput, recommended, splitReply } from '../hooks/questions'

const Q = [
  {
    question: 'Which separator should the CSV use?',
    header: 'Separator',
    options: [
      { label: 'Semicolon', adds: 'Use a semicolon as the CSV separator.' },
      { label: 'Comma', adds: 'Keep the comma as the CSV separator.' },
    ],
  },
]

describe('splitReply', () => {
  test('a reply without QUESTIONS is all rewrite', () => {
    expect(splitReply('Fix the export.')).toEqual({ body: 'Fix the export.', questions: [] })
  })
  test('reads the questions after the rewrite', () => {
    const r = splitReply(`Add a CSV export for reports.\nQUESTIONS: ${JSON.stringify(Q)}`)
    expect(r.body).toBe('Add a CSV export for reports.')
    expect(r.questions).toEqual(Q)
  })
  test('malformed JSON keeps the rewrite and drops the questions', () => {
    expect(splitReply('Add it.\nQUESTIONS: [{"question": "x?"')).toEqual({ body: 'Add it.', questions: [] })
  })
  test('at most two questions, each with two to four options', () => {
    const one = { question: 'q?', header: 'H', options: [{ label: 'a', adds: 'A.' }, { label: 'b', adds: 'B.' }] }
    const bad = { question: 'only one option?', header: 'H', options: [{ label: 'a', adds: 'A.' }] }
    const r = splitReply(`Do it.\nQUESTIONS: ${JSON.stringify([bad, one, one, one, one])}`)
    expect(r.questions).toHaveLength(2)
  })
})

describe('answers', () => {
  test('the first option is marked recommended in the dialog', () => {
    expect(askInput(Q).questions[0]!.options.map(o => o.label)).toEqual(['Semicolon (recommended)', 'Comma'])
  })
  test('a picked option adds its sentence; the recommended label counts too', () => {
    expect(applyAnswers('Add a CSV export.', Q, { [Q[0]!.question]: 'Comma' })).toBe('Add a CSV export. Keep the comma as the CSV separator.')
    expect(applyAnswers('Add a CSV export.', Q, { [Q[0]!.question]: 'Semicolon (recommended)' })).toBe('Add a CSV export. Use a semicolon as the CSV separator.')
  })
  test('text typed under Other is added as written', () => {
    expect(applyAnswers('Add a CSV export.', Q, { [Q[0]!.question]: 'tab' })).toBe('Add a CSV export. Separator: tab.')
  })
  test('with no answers, each question takes its recommended option', () => {
    expect(recommended('Add a CSV export.', Q)).toBe('Add a CSV export. Use a semicolon as the CSV separator.')
  })
})
