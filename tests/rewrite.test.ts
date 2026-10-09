import { describe, expect, test } from 'claude-code/testing'
import { RULES, SHAPES } from '../hooks/bank'
import { clean, completePrompt, familyOf, forkPrompt, KEEP, wordLimit } from '../hooks/rewrite'

const DRAFT = 'login broken again after your change, fix'

describe('familyOf', () => {
  test('maps model ids and aliases to a rule family', () => {
    expect(familyOf('claude-fable-5-1')).toBe('fable')
    expect(familyOf('claude-opus-5-5')).toBe('opus')
    expect(familyOf('sonnet')).toBe('sonnet')
    expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(familyOf('some-other-model')).toBe('common')
  })
})

describe('prompts', () => {
  test('the fork prompt carries the draft, the family rules and the hard limit', () => {
    const p = forkPrompt(DRAFT, 'opus')
    expect(p).toContain(`<draft>\n${DRAFT}\n</draft>`)
    expect(p).toContain('Give the rewritten prompt and nothing else, at most 60 words.')
    expect(p).toContain(RULES.opus[0]!.text)
    expect(p).not.toContain(RULES.fable[0]!.text)
    for (const s of SHAPES) expect(p).toContain(`${s.name}: `)
  })

  test('nothing we send asks the model to show its reasoning', () => {
    for (const fam of ['common', 'fable', 'opus', 'sonnet', 'haiku'] as const) {
      const p = forkPrompt(DRAFT, fam).toLowerCase()
      // The one rule that names these phrases forbids them; take it out first.
      const rest = p.replace(RULES.common.find(r => r.id === 'no-reasoning-echo')!.text.toLowerCase(), '')
      expect(rest).not.toContain('step by step')
      expect(rest).not.toContain('show your reasoning')
      expect(rest).not.toContain('explain your thinking')
    }
  })

  test('the complete prompt pastes at most four messages, each cut to 600 characters', () => {
    const recent = Array.from({ length: 6 }, (_, i) => ({ role: 'user' as const, text: `m${i} ` + 'x'.repeat(900) }))
    const p = completePrompt(DRAFT, 'common', recent)
    expect(p).not.toContain('m0 ')
    expect(p).not.toContain('m1 ')
    expect(p).toContain('m5 ')
    expect(p).not.toContain('x'.repeat(601))
  })

  test('rewriteLanguage en asks for English and forbids KEEP for other languages; same leaves it out', () => {
    const en = forkPrompt(DRAFT, 'sonnet', [], { language: 'en' })
    expect(en).toContain('Write the rewrite in English, whatever language the draft is in')
    expect(en).toContain('If the draft is not in English, do not reply KEEP')
    expect(completePrompt(DRAFT, 'sonnet', [], [], { language: 'en' })).toContain('Write the rewrite in English')
    expect(forkPrompt(DRAFT, 'sonnet')).not.toContain('Write the rewrite in English')
    expect(forkPrompt(DRAFT, 'sonnet', [], { language: 'same' })).not.toContain('Write the rewrite in English')
  })

  test('ask adds the question instructions; facts go in their own block', () => {
    const p = forkPrompt(DRAFT, 'opus', [], { ask: true, facts: 'Files changed this session: calc.py' })
    expect(p).toContain('write a line QUESTIONS: followed by a JSON array')
    expect(p).toContain('<session_facts>\nFiles changed this session: calc.py\n</session_facts>')
    expect(forkPrompt(DRAFT, 'opus')).not.toContain('QUESTIONS:')
    expect(forkPrompt(DRAFT, 'opus')).not.toContain('<session_facts>')
  })

  test('exemplars appear only when there are some, at most 20', () => {
    expect(forkPrompt(DRAFT, 'common')).not.toContain('<examples>')
    const list = Array.from({ length: 25 }, (_, i) => ({ original: `o${i}`, sent: `s${i}` }))
    const p = forkPrompt(DRAFT, 'common', list)
    expect(p).toContain('User sent instead: s24')
    expect(p).not.toContain('User sent instead: s4\n')
  })
})

describe('wordLimit', () => {
  test('twice the draft or 60, whichever is more, capped at 180', () => {
    expect(wordLimit('a b c')).toBe(60)
    expect(wordLimit('w '.repeat(50))).toBe(100)
    expect(wordLimit('w '.repeat(120))).toBe(180)
  })
})

describe('clean', () => {
  test('takes a plain rewrite as is', () => {
    expect(clean('The login test fails since the session change. Fix it.', DRAFT)).toEqual({
      rewritten: 'The login test fails since the session change. Fix it.',
    })
  })
  test('strips fences, quotes and a draft wrapper', () => {
    expect(clean('```\nFix the login test.\n```', DRAFT)).toEqual({ rewritten: 'Fix the login test.' })
    expect(clean('"Fix the login test."', DRAFT)).toEqual({ rewritten: 'Fix the login test.' })
    expect(clean('<draft>Fix the login test.</draft>', DRAFT)).toEqual({ rewritten: 'Fix the login test.' })
  })
  test('turns down KEEP, empty, unchanged and overlong replies', () => {
    expect(clean(KEEP, DRAFT)).toEqual({ rejected: 'keep' })
    expect(clean(' KEEP. ', DRAFT)).toEqual({ rejected: 'keep' })
    expect(clean('  ', DRAFT)).toEqual({ rejected: 'empty' })
    expect(clean(DRAFT, DRAFT)).toEqual({ rejected: 'same' })
    expect(clean('word '.repeat(76), DRAFT)).toEqual({ rejected: 'too-long' })
    expect(clean('word '.repeat(75), DRAFT)).toHaveProperty('rewritten')
  })
})
