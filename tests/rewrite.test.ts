import { describe, expect, test } from 'claude-code/testing'
import { RULES, SHAPES } from '../hooks/bank'
import { anchors, clean, completePrompt, familyOf, forkPrompt, KEEP, lost, wordLimit } from '../hooks/rewrite'

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

  test('ask wants the value only the user knows, with candidate values as options', () => {
    for (const family of ['fable', 'sonnet'] as const) {
      const p = completePrompt(DRAFT, family, [], [], { ask: true })
      expect(p).toContain('the value itself is the question')
      expect(p).toContain("ask for that expectation itself; it is not in the code")
      expect(p).toContain('Options are candidate values')
      expect(p).toContain('never a single example')
      expect(p).toContain('if two values are missing, ask both')
      expect(p).toContain('a value only the user knows is asked, not assumed')
    }
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
    expect(wordLimit('w '.repeat(59))).toBe(118)
  })
  test('a long draft is tidied into no more than its own length', () => {
    expect(wordLimit('w '.repeat(60))).toBe(60)
    expect(wordLimit('w '.repeat(250))).toBe(250)
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

const LONG = `tamam şimdi calc.py'ye bir şeyler ekleyelim ama önce şunu söyleyeyim ben aslında bir hesap makinesi istiyorum yani toplama çıkarma çarpma bölme olsun, bölmede sıfıra bölme hatası olursa düzgün bir mesaj versin, bir de komut satırından çalıştırabileyim yani \`python calc.py 3 + 4\` gibi, testler de olsun pytest ile, ama önce bana planı söyle sonra yaparsın, yani önce plan sonra kod, komut satırı kısmı önemli bu arada onu unutma, testler de önemli`

describe('long drafts', () => {
  test('get the tidy instruction instead of the rules', () => {
    const p = forkPrompt(LONG, 'opus')
    expect(p).toContain('Tidy it, keeping their intent and voice.')
    expect(p).toContain('Say each thing once')
    expect(p).not.toContain('Rules:')
    expect(p).toContain(`at most ${LONG.split(/\s+/).length} words`)
  })
  test('short drafts keep the rules', () => {
    expect(forkPrompt(DRAFT, 'opus')).toContain('Rules:')
    expect(completePrompt(LONG, 'opus', [])).toContain('Tidy it')
  })
})

describe('anchors and lost', () => {
  test('finds code spans, quotes, paths, file names, URLs and numbers', () => {
    const a = anchors('see `npm test` and "In production" in src/app.ts, auth.png, https://x.dev/a and 41 or 2.5')
    for (const x of ['npm test', 'In production', 'src/app.ts', 'auth.png', 'https://x.dev/a', '41', '2.5']) expect(a).toContain(x)
  })
  test('trims quotes and takes no closing tag for a path', () => {
    expect(anchors('say " fail safe" here </pasted_content>')).toEqual(['fail safe'])
  })
  test('leaves list markers out', () => {
    expect(anchors('1- do this\n2) then that')).toEqual([])
  })
  test('names what a rewrite dropped', () => {
    expect(lost('upload 31 and 32 from out/31.mp4', 'Upload video 31 from out/31.mp4.')).toEqual(['32'])
  })
  test('clean turns down a rewrite that drops one', () => {
    expect(clean('Fix the login test.', 'login broken again, see auth.ts')).toEqual({ rejected: 'lost', lost: ['auth.ts'] })
  })
})
