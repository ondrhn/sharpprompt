import { RULES, SHAPES, type Family } from './bank'

// Everything about the rewrite that needs no $: which rules apply, the text
// we send the model, and what we accept back.

export const MAX_WORDS = 180
export const MIN_ROOM = 60
// From this many words a draft is tidied, not rewritten: in two days of the
// author's use the long ones were repetitive rather than vague.
export const LONG_WORDS = 60
export const KEEP = 'KEEP'

export type Exemplar = { original: string; sent: string }

// 'same' keeps the user's language; 'en' asks for English whatever the
// draft is written in (the rewriteLanguage setting).
export type RewriteOptions = {
  language?: 'same' | 'en'
  // May the rewriter ask about gaps before the prompt goes out?
  ask?: boolean
  // What the session touched, from the transcript (see facts.ts).
  facts?: string
  // How many of the last messages the fallback completion sees (default 4).
  // The benchmark passes them all, standing in for the fork it cannot use.
  window?: number
}

const ASK = `If the draft leaves out a value the work needs that only the user can supply (a separator, a threshold, a count, an order, a currency, a date format, a file or function name), ask for it, at most 2 questions; if two values are missing, ask both. If the draft names such a thing without its value, the value itself is the question. When the draft defers to another team's or tool's expectation (their import, their format, what another system accepts), ask for that expectation itself; it is not in the code. Do not ask what you can read in the conversation or infer from the code, and never ask whether to add tests (the answer is no). Options are candidate values (';', ',', tab; EUR, USD; 3, 5), never ways of supplying the information ('paste a sample', 'I'll list it', 'spec in repo'); if you cannot name candidates, give two plausible values and let the user type the rest. Name at least two different values in the labels, never a single example. If you ask, leave those points out of the rewrite, because the answers will be added after it. Then, after the rewrite, write a line QUESTIONS: followed by a JSON array, each item {"question": "...?", "header": "<12 characters", "options": [{"label": "<1-5 words>", "adds": "<the sentence to add to the prompt if picked>"}]}, 2 to 4 options each, your recommended option first. If nothing needs asking, write no QUESTIONS line. This overrides the rule about taking the most direct reading: a value only the user knows is asked, not assumed.`

const ENGLISH = `Write the rewrite in English, whatever language the draft is in; this overrides the rules about the user's language. Keep file names, function names, commands and quoted text exactly as written. If the draft is not in English, do not reply ${'KEEP'}: translate it while you make it clear.`

export function familyOf(model: string): Family {
  const m = model.toLowerCase()
  for (const f of ['fable', 'opus', 'sonnet', 'haiku'] as const) {
    if (m.includes(f)) return f
  }
  return 'common'
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

export const isLong = (draft: string) => words(draft) >= LONG_WORDS

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)

function rulesFor(family: Family): string {
  const list = family === 'common' ? RULES.common : [...RULES.common, ...RULES[family]]
  return list.map(r => `- ${r.text}`).join('\n')
}

function shapes(): string {
  return SHAPES.map(s =>
    [
      `${s.name}: ${s.summary} A good one carries: ${s.fields}`,
      `  Before: ${s.before}`,
      `  After: ${s.after}`,
    ].join('\n'),
  ).join('\n')
}

// The user's own edits of earlier suggestions: what they changed our
// rewrite into is the best signal of how they like their prompts.
function exemplars(list: readonly Exemplar[]): string {
  if (list.length === 0) return ''
  const items = list
    .slice(-20)
    .map(x => `<example>\nSuggested: ${clip(x.original, 400)}\nUser sent instead: ${clip(x.sent, 400)}\n</example>`)
    .join('\n')
  return `\nWhen this user edited a suggestion before sending, this is what they changed it to. Match their taste:\n<examples>\n${items}\n</examples>\n`
}

// How long a rewrite of this draft may be: twice the draft or 60 words,
// whichever is more, never past 180. The model gets this number, not 180:
// told 180, it wrote 77 and 125 words for 16 and 14 word drafts. A long
// draft is tidied, and tidying does not make it longer.
export function wordLimit(draft: string): number {
  if (isLong(draft)) return words(draft)
  return Math.min(Math.max(2 * words(draft), MIN_ROOM), MAX_WORDS)
}

const TIDY = `The draft is long and was typed in one go: it may say the same thing twice, jump between points, or contradict itself. Tidy it:
- Keep every request and constraint. Keep every number, file name, path, command, URL and quoted text exactly as written.
- Say each thing once: merge the repeats.
- Put the requests in the order they should be done; number them if there are three or more.
- Where two parts contradict and the conversation does not settle it, keep the later one and add a short line naming the conflict.
- Add nothing the draft does not say: no new requirements, files, checks or tests.
- Keep any <pasted_content> block exactly as it is, its tags included.
- Keep the user's voice and language.`

function tidyInstructions(list: readonly Exemplar[], limit: number, opts: RewriteOptions): string {
  return `${TIDY}
${opts.language === 'en' ? `\n${ENGLISH}\n` : ''}${opts.ask ? `\n${ASK}\n` : ''}${exemplars(list)}
If the draft is already in order and says each thing once, reply with exactly ${KEEP}.
Give the tidied prompt and nothing else, at most ${limit} words.`
}

// The things a rewrite must not lose: quoted and code spans, URLs, paths,
// file names, commit hashes and numbers (list markers aside). On 28 real rewrites from the
// author's sessions none was flagged.
// facts: only what goes stale or gets mixed up (URLs, paths, file names,
// hashes, numbers of two digits or more), for the band's added line; quoted
// labels and small numbers there were mostly echoes of the conversation.
export function anchors(draft: string, kind: 'all' | 'facts' = 'all'): string[] {
  const out = new Set<string>()
  const take = (re: RegExp, text = draft, g = 0) => {
    for (const m of text.matchAll(re)) if (m[g]?.trim()) out.add(m[g].trim())
  }
  if (kind === 'all') {
    take(/`([^`\n]+)`/g, draft, 1)
    // One character is enough: ";" not "," gives ; and , (at two or more,
    // the words between them were taken instead).
    take(/"([^"\n]{1,80})"/g, draft, 1)
  }
  take(/https?:\/\/\S+[^\s.,;:!?)'"`>\]*]/g)
  // and/or, w/o, I/O, login/logout are words, not paths: a path starts at
  // the root, home or here, ends in a slash or a file name, or has two slashes.
  for (const m of draft.matchAll(/(?<![\p{L}\p{N}_./~-])[./~]*\/?(?:[\p{L}\p{N}_.~-]+\/)+(?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_-])?/gu)) {
    const p = m[0].replace(/^\.(?=[^./])/, '')
    if (/^[./~]/.test(p) || /\/$/.test(p) || (p.match(/\//g) ?? []).length >= 2 || /\.[\p{L}\p{N}]+$/u.test(p)) out.add(p)
  }
  take(/(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]+\.(?:py|ts|tsx|js|mjs|json|md|png|jpg|jpeg|txt|sh|yml|yaml|toml|csv|xlsx|html|css|mp4|srt|log)(?![\p{L}\p{N}_])/giu)
  take(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g)
  // List markers, at a line start or inline (1) ... 2) ...), are not numbers to keep.
  const unlisted = draft.replace(/(^|\n)\s*\d+[-.)]\s/g, '$1').replace(/(^|[\s:;,])\(?\d{1,2}\)\s/g, '$1')
  take(kind === 'all' ? /(?<![\w.])\d+(?:[.,]\d+)*(?![\d.,]*\d)/g : /(?<![\w.])\d{2,}(?:[.,]\d+)*(?![\d.,]*\d)/g, unlisted)
  // A piece of a longer one (test.ts in tests/auth.test.ts) adds nothing.
  return [...out].filter(a => ![...out].some(b => b !== a && b.includes(a) && hasToken(b, a)))
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// a stands on its own in text: "31" is in "out/31.mp4", but "2" is not in
// "120" or "2.5", and "test" is not in "tests". A number only needs other
// digits kept off it, so "500ms" keeps 500 and "v2" keeps 2.
export function hasToken(text: string, a: string): boolean {
  if (!text.includes(a)) return false
  const edge = (c: string | undefined) => (c === undefined ? '' : /\p{N}/u.test(c) ? 'num' : /[\p{L}_]/u.test(c) ? 'word' : '')
  const guard = { num: ['(?<!\\p{N}|\\p{N}[.,])', '(?!\\p{N}|[.,]\\p{N})'], word: ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])'], '': ['', ''] }
  const first = edge(a[0])
  const last = edge(a.at(-1))
  return new RegExp(guard[first][0] + esc(a) + guard[last][1], 'u').test(text)
}

export const lost = (draft: string, text: string) => anchors(draft).filter(a => !hasToken(text, a))

// The same kinds of thing the rewrite brought in from elsewhere: a path, a
// hash or a number the user did not type, shown on the band so a stale one
// is caught before it goes out under their name.
export const added = (draft: string, text: string) => anchors(text, 'facts').filter(a => !hasToken(draft, a))

export function addedLine(draft: string, text: string): string | null {
  const list = added(draft, text)
  if (list.length === 0) return null
  const shown = list.slice(0, 5).map(a => (a.length > 40 ? `...${a.slice(-37)}` : a))
  return `not in your draft: ${shown.join(', ')}${list.length > 5 ? ` and ${list.length - 5} more` : ''}`
}

function instructions(family: Family, list: readonly Exemplar[], limit: number, opts: RewriteOptions, draft = ''): string {
  if (isLong(draft)) return tidyInstructions(list, limit, opts)
  return `Rules:
${rulesFor(family)}
${opts.language === 'en' ? `\n${ENGLISH}\n` : ''}${opts.ask ? `\n${ASK}\n` : ''}
Task shapes, to see what a good prompt of each kind carries. Pick the closest one, or none:
${shapes()}
${exemplars(list)}
If the draft is already clear enough to act on, reply with exactly ${KEEP}.
Give the rewritten prompt and nothing else, at most ${limit} words.`
}

// For $.model.fork: the model sees the whole conversation before this, so
// "the file above" can be resolved without us quoting anything.
export function forkPrompt(draft: string, family: Family, list: readonly Exemplar[] = [], opts: RewriteOptions = {}): string {
  return `This message is from the sharpprompt plugin, not the user, and is not a task to carry out. The user has typed the draft below as their next message to you and has not sent it yet. ${isLong(draft) ? 'Tidy it' : 'Rewrite it so it is clear for you to act on in this conversation'}, keeping their intent and voice.
${factsBlock(opts)}
<draft>
${draft}
</draft>

${instructions(family, list, wordLimit(draft), opts, draft)}`
}

export type Recent = { role: 'user' | 'assistant'; text: string }

function factsBlock(opts: RewriteOptions): string {
  return opts.facts ? `\nWhat this session has touched, from its transcript:\n<session_facts>\n${opts.facts}\n</session_facts>\n` : ''
}

// For $.model.complete when there is nothing to fork yet: no history, so we
// hand over the last few messages ourselves, cut short.
export function completePrompt(draft: string, family: Family, recent: readonly Recent[], list: readonly Exemplar[] = [], opts: RewriteOptions = {}): string {
  const convo = recent
    .slice(-(opts.window ?? 4))
    .map(m => `<${m.role}>${clip(m.text, 600)}</${m.role}>`)
    .join('\n')
  return `A user of Claude Code has typed the draft below as their next message and has not sent it yet. ${isLong(draft) ? 'Tidy it' : 'Rewrite it so it is clear for Claude to act on'}, keeping their intent and voice.
${convo ? `\nThe last messages of the conversation, cut short:\n<conversation>\n${convo}\n</conversation>\n` : ''}${factsBlock(opts)}
<draft>
${draft}
</draft>

${instructions(family, list, wordLimit(draft), opts, draft)}`
}

export type Cleaned = { rewritten: string } | { rejected: 'keep' | 'empty' | 'too-long' | 'same' } | { rejected: 'lost'; lost: string[] }

// What the model sent back, made safe to put in the prompt box: fences and
// wrapping quotes off, and turned down when it is no rewrite at all.
// also: text that goes out with the rewrite, such as the sentences the
// answers to its questions add; an anchor found there is not lost.
export function clean(reply: string, draft: string, also = ''): Cleaned {
  let t = reply.trim()
  t = t.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim()
  t = t.replace(/^<draft>\s*([\s\S]*?)\s*<\/draft>$/i, '$1').trim()
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim()
  if (t === '') return { rejected: 'empty' }
  // KEEP in bold or backticks, or with a reason after it, is still KEEP.
  const head = (t.split('\n')[0] ?? '').replace(/[*_`"'\s]/g, '').replace(/[.!:]$/, '')
  if (head.toUpperCase() === KEEP) return { rejected: 'keep' }
  // A little slack so a near miss still reaches the user.
  if (words(t) > wordLimit(draft) + 15) return { rejected: 'too-long' }
  if (t === draft.trim()) return { rejected: 'same' }
  const gone = lost(draft, also ? `${t}\n${also}` : t)
  if (gone.length) return { rejected: 'lost', lost: gone }
  return { rewritten: t }
}
