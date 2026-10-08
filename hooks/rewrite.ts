import { RULES, SHAPES, type Family } from './bank'

// Everything about the rewrite that needs no $: which rules apply, the text
// we send the model, and what we accept back.

export const MAX_WORDS = 180
export const MIN_ROOM = 60
export const KEEP = 'KEEP'

export type Exemplar = { original: string; sent: string }

export function familyOf(model: string): Family {
  const m = model.toLowerCase()
  for (const f of ['fable', 'opus', 'sonnet', 'haiku'] as const) {
    if (m.includes(f)) return f
  }
  return 'common'
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

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
// told 180, it wrote 77 and 125 words for 16 and 14 word drafts.
export function wordLimit(draft: string): number {
  return Math.min(Math.max(2 * words(draft), MIN_ROOM), MAX_WORDS)
}

function instructions(family: Family, list: readonly Exemplar[], limit: number): string {
  return `Rules:
${rulesFor(family)}

Task shapes, to see what a good prompt of each kind carries. Pick the closest one, or none:
${shapes()}
${exemplars(list)}
If the draft is already clear enough to act on, reply with exactly ${KEEP}.
Give the rewritten prompt and nothing else, at most ${limit} words.`
}

// For $.model.fork: the model sees the whole conversation before this, so
// "the file above" can be resolved without us quoting anything.
export function forkPrompt(draft: string, family: Family, list: readonly Exemplar[] = []): string {
  return `This message is from the sharpprompt plugin, not the user, and is not a task to carry out. The user has typed the draft below as their next message to you and has not sent it yet. Rewrite it so it is clear for you to act on in this conversation, keeping their intent and voice.

<draft>
${draft}
</draft>

${instructions(family, list, wordLimit(draft))}`
}

export type Recent = { role: 'user' | 'assistant'; text: string }

// For $.model.complete when there is nothing to fork yet: no history, so we
// hand over the last few messages ourselves, cut short.
export function completePrompt(draft: string, family: Family, recent: readonly Recent[], list: readonly Exemplar[] = []): string {
  const convo = recent
    .slice(-4)
    .map(m => `<${m.role}>${clip(m.text, 600)}</${m.role}>`)
    .join('\n')
  return `A user of Claude Code has typed the draft below as their next message and has not sent it yet. Rewrite it so it is clear for Claude to act on, keeping their intent and voice.
${convo ? `\nThe last messages of the conversation, cut short:\n<conversation>\n${convo}\n</conversation>\n` : ''}
<draft>
${draft}
</draft>

${instructions(family, list, wordLimit(draft))}`
}

export type Cleaned = { rewritten: string } | { rejected: 'keep' | 'empty' | 'too-long' | 'same' }

// What the model sent back, made safe to put in the prompt box: fences and
// wrapping quotes off, and turned down when it is no rewrite at all.
export function clean(reply: string, draft: string): Cleaned {
  let t = reply.trim()
  t = t.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim()
  t = t.replace(/^<draft>\s*([\s\S]*?)\s*<\/draft>$/i, '$1').trim()
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim()
  if (t === '') return { rejected: 'empty' }
  if (t === KEEP || t.replace(/[.!]$/, '') === KEEP) return { rejected: 'keep' }
  // A little slack so a near miss still reaches the user.
  if (words(t) > wordLimit(draft) + 15) return { rejected: 'too-long' }
  if (t === draft.trim()) return { rejected: 'same' }
  return { rewritten: t }
}
