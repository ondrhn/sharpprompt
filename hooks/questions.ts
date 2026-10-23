// The questions a rewrite may come back with, and how answers turn into
// sentences of the prompt. No $ here.

export type QuestionOption = { label: string; adds: string }
export type Question = { question: string; header: string; options: QuestionOption[] }

// Each question is its own dialog, so two at most.
export const MAX_QUESTIONS = 2
export const MAX_ADDS = 200

// The rewriter writes its rewrite, then optionally a QUESTIONS: line with a
// JSON array. The rewriter leaves an asked point out of the rewrite, so a
// question we cannot ask (malformed, too many, too few usable options)
// leaves a rewrite with a hole in it: dropped is then true and the rewrite
// is turned down.
export function splitReply(reply: string): { body: string; questions: Question[]; dropped: boolean } {
  const at = reply.search(/\n\s*QUESTIONS:\s*/)
  if (at < 0) return { body: reply, questions: [], dropped: false }
  const body = reply.slice(0, at)
  const json = reply.slice(at).replace(/^\s*QUESTIONS:\s*/, '').trim()
  let raw: unknown
  try {
    raw = JSON.parse(json.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { body, questions: [], dropped: true }
  }
  if (!Array.isArray(raw)) return { body, questions: [], dropped: true }
  const questions: Question[] = []
  let dropped = raw.length > MAX_QUESTIONS
  for (const q of raw) {
    if (questions.length === MAX_QUESTIONS) break
    if (!q || typeof q.question !== 'string' || !Array.isArray(q.options)) {
      dropped = true
      continue
    }
    const options = q.options
      .filter((o: unknown): o is QuestionOption => !!o && typeof (o as QuestionOption).label === 'string' && typeof (o as QuestionOption).adds === 'string')
      .slice(0, 4)
      .map((o: QuestionOption) => ({ label: o.label.trim().slice(0, 60), adds: o.adds.trim() }))
    // An answer adds one sentence; a longer one would blow past the
    // rewrite's word limit after the length check has run. Dropping just
    // that option could move "(recommended)" onto another, so the question goes.
    if (options.length < 2 || options.some((o: QuestionOption) => o.adds.length > MAX_ADDS)) {
      dropped = true
      continue
    }
    const header = typeof q.header === 'string' && q.header.trim() ? q.header.trim().slice(0, 12) : 'Question'
    questions.push({ question: q.question.trim(), header, options })
  }
  return { body, questions, dropped }
}

// The AskUserQuestion input: the first option is the rewriter's
// recommendation and says so.
export function askInput(questions: readonly Question[]) {
  return {
    questions: questions.map(q => ({
      question: q.question,
      header: q.header,
      multiSelect: false,
      options: q.options.map((o, i) => ({ label: i === 0 ? `${o.label} (recommended)` : o.label, description: o.adds })),
    })),
  }
}

// Answers keyed by question text, as AskUserQuestion returns them. A picked
// option adds its sentence; anything else typed under "Other" is added as
// the user wrote it. An unanswered question adds the recommended option.
export function applyAnswers(rewrite: string, questions: readonly Question[], answers: Readonly<Record<string, unknown>>): string {
  const lines = questions.map(q => {
    const a = typeof answers[q.question] === 'string' ? (answers[q.question] as string).trim() : ''
    const picked = q.options.find((o, i) => a === o.label || a === `${o.label} (recommended)` || (i === 0 && a === ''))
    if (picked) return picked.adds
    return `${q.header}: ${a}.`
  })
  return [rewrite.trim(), ...lines].join(' ')
}

// With no one to ask (VS Code, headless), each question takes its
// recommended option.
export function recommended(rewrite: string, questions: readonly Question[]): string {
  return applyAnswers(rewrite, questions, {})
}
