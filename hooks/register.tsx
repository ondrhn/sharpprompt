import type { EngineInterface, ModelUsage, PromptSubmitInput, PromptSubmitResult, Register } from 'claude-code'
import type { SharppromptDecision, SharppromptMode, SharppromptPending, SharppromptRewrite, SharppromptVerdict } from '../types'
import { contextNote, describe, DROP_NOTE, EDIT_OVERLAP, HELP, overlap, parseCommand } from './flow'
import { sessionFacts } from './facts'
import { endsWithQuestion, gate, RAW_PREFIX } from './gate'
import { clip, logLine, MAX_LOG, newRecord, patchLog, type LogRecord } from './log'
import { applyAnswers, askInput, recommended, splitReply, type Question } from './questions'
import { countKey, lastRewriteLine, MAX_RECORDS, summary, tokens, wordCount, type ClassifyRecord, type Counts, type DecisionRecord, type LateRecord, type RewriteRecord, type TurnRecord } from './stats'
import { addedLine, clean, completePrompt, familyOf, forkPrompt, isLong, wordLimit, type Exemplar, type Recent, type RewriteOptions } from './rewrite'

// The engine checks that $ never leaves this file, so everything that calls
// it lives here and gate.ts stays pure.

const isOff = { plugin: 'sharpprompt', key: 'isOff' } as const
const lastDecision = { plugin: 'sharpprompt', key: 'lastDecision' } as const
const pending = { plugin: 'sharpprompt', key: 'pending' } as const
const modeOverride = { plugin: 'sharpprompt', key: 'mode' } as const

// The turn now running and how its prompt got there; tool calls counted on
// the main thread. Module state: a reload mid-turn loses one turn's record.
let outgoing: TurnRecord['prompt'] | null = null
let toolCalls = 0
// The usage-log record of the prompt that started the running turn.
let turnLog: string | null = null

type Options = Readonly<Record<string, unknown>>

export const CLASSIFY_MS = 2_500

// The labels the classifier picks from; the wording is what it judges by.
const CLEAR = 'clear and specific'
const ROUGH = 'rough: vague or missing what to deliver'
// 10 s, not 5: from 12 to 23 Oct 2026, 32 of 79 rewrites of drafts of 20
// words or less timed out at 5 s. The forks that lost finished in 7.5 s
// (median), 9.9 s at p90; the time follows the conversation, not the draft.
export const REWRITE_MS = 10_000

// Long drafts get longer: over 20 words, 100 ms more per word, up to 25 s.
// 15 of 40 rough prompts timed out in two days of use (9 to 11 Oct 2026),
// median 32 words, while the rewrites that came back were 3 to 31 words.
// Tidying six of those long drafts on Opus 5.5 took 2.5 s (60 words) to
// 10.9 s (90) and 21.2 s (253).
export const REWRITE_MAX_MS = 25_000
export function rewriteMs(draft: string): number {
  return Math.min(REWRITE_MS + 100 * Math.max(0, wordCount(draft) - 20), REWRITE_MAX_MS)
}

// The engine heads the line with the plugin's name, so no prefix here. Esc
// while it shows ends the wait and puts the draft back in the box, unsent
// (tmux, 2.1.296).
export const STATUS_CHECKING = 'checking (Esc: yours back in the box)'
export const STATUS_REWRITING = 'rewriting (Esc: yours back in the box)'

// Tokens a fork spent after it lost its race: it finished in the background
// and was billed anyway. Read out by the stats in a later step.
export const late = { forks: 0, ms: [] as number[], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }

function addLate(u: ModelUsage, ms: number) {
  late.forks++
  late.ms.push(ms)
  late.usage.input_tokens += u.input_tokens
  late.usage.output_tokens += u.output_tokens
  late.usage.cache_read_input_tokens += u.cache_read_input_tokens
  late.usage.cache_creation_input_tokens += u.cache_creation_input_tokens
}

const TIMEOUT: unique symbol = Symbol('timeout')

// fork and classify take no time limit, so we race them against the clock.
// The loser keeps running: a fork that lost still finishes in the background
// and is billed (README, Limits).
async function race<T>($: EngineInterface, work: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  const stop = new AbortController()
  // A sleep that fails for its own reasons must not read as a timeout: the
  // work then runs unraced, and the engine's hook budget is the backstop.
  const timer: Promise<typeof TIMEOUT> = $.clock.sleep(ms, { signal: stop.signal }).then(
    () => TIMEOUT,
    () => new Promise<never>(() => {}),
  )
  try {
    return await Promise.race([work, timer])
  } finally {
    stop.abort()
  }
}

async function classify($: EngineInterface, text: string, model: string): Promise<SharppromptVerdict> {
  try {
    const label = await race($, $.model.classify(text, [CLEAR, ROUGH], { model }), CLASSIFY_MS)
    if (label === TIMEOUT) return 'timeout'
    if (label === CLEAR) return 'clear'
    if (label === ROUGH) return 'rough'
    return 'error'
  } catch {
    return 'error'
  }
}

async function recent($: EngineInterface): Promise<Recent[]> {
  const rows = await $.session.messages()
  return rows
    .filter(r => r.text.trim() !== '')
    .slice(-4)
    .map(r => ({ role: r.role, text: r.text }))
}

async function exemplarsOf($: EngineInterface): Promise<Exemplar[]> {
  const v = await $.store.get('exemplars')
  return Array.isArray(v) ? (v as Exemplar[]) : []
}

// Fork first: it reads the conversation from the prompt cache. With nothing
// to fork yet (first turn, after /clear) a plain completion with the last few
// messages pasted in. Both race the clock; losing means no rewrite.
async function rewrite($: EngineInterface, draft: string, helper: string, opts: RewriteOptions = {}): Promise<SharppromptRewrite> {
  const started = await $.clock.now()
  const family = familyOf(await $.session.model())
  const examples = await exemplarsOf($)
  const took = async () => (await $.clock.now()) - started

  const forking = $.model.fork({ prompt: forkPrompt(draft, family, examples, opts) })
  const limit = rewriteMs(draft)
  const forked = await race($, forking, limit)
  if (forked === TIMEOUT) {
    void forking.then(async r => ('usage' in r ? addLate(r.usage, await took()) : undefined), () => {})
    return { outcome: 'timeout', via: 'fork', ms: await took() }
  }

  let reply = forked
  let via: 'fork' | 'complete' = 'fork'
  // Esc while we wait cuts the fork: the person took the draft back.
  if (!reply.isAnswered && reply.reason === 'aborted') return { outcome: 'aborted', via, ms: await took(), usage: reply.usage }
  if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
    via = 'complete'
    reply = await $.model.complete({
      model: helper,
      prompt: completePrompt(draft, family, await recent($), examples, opts),
      // A cut reply comes back answered, with no sign it was cut, so the cap
      // leaves room for the whole word limit (a tidy is as long as its
      // draft) plus questions: about 2 tokens a word, 600 at least.
      maxTokens: Math.max(600, 2 * wordLimit(draft) + 400),
      effort: 'low',
      timeoutMs: limit,
    })
    if (!reply.isAnswered && reply.reason === 'aborted') return { outcome: 'timeout', via, ms: await took() }
  }
  if (!reply.isAnswered) return { outcome: 'error', via, ms: await took(), detail: reply.reason, usage: reply.usage }

  const { body, questions, dropped } = opts.ask ? splitReply(reply.text) : { body: reply.text, questions: [], dropped: false }
  // A question we cannot ask leaves its point out of the body.
  if (dropped) return { outcome: 'error', via, ms: await took(), detail: 'questions', usage: reply.usage, replyChars: reply.text.length }
  // The asked points and their candidate values live in the options.
  const c = clean(body, draft, questions.flatMap(q => q.options.map(o => `${o.label} ${o.adds}`)).join('\n'))
  const ms = await took()
  // The reply's own length: output tokens well past it went to thinking.
  const replyChars = reply.text.length
  if ('rejected' in c) return { outcome: c.rejected, via, ms, usage: reply.usage, replyChars, ...('lost' in c ? { detail: c.lost.join(' ') } : {}) }
  return { outcome: 'rewritten', via, ms, usage: reply.usage, replyChars, text: c.rewritten, ...(questions.length ? { questions } : {}) }
}

async function lastReply($: EngineInterface): Promise<string> {
  const rows = await $.session.messages()
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.role === 'assistant' && row.text.trim() !== '') return row.text
  }
  return ''
}

const helperModel = (options: Options) => (typeof options.optimizerModel === 'string' ? options.optimizerModel : 'haiku')
// Both v0.2 helpers are on unless the user turned them off.
async function rewriteOptions($: EngineInterface, options: Options): Promise<RewriteOptions> {
  const facts = options.sessionFacts === false ? '' : sessionFacts(await $.session.messages())
  return {
    language: options.rewriteLanguage === 'en' ? 'en' : 'same',
    ask: options.askBeforeSend !== false,
    ...(facts ? { facts } : {}),
  }
}

// The engine shows a plugin's questions one dialog at a time ($.ui.ask), so
// the rewriter asks at most two. null when the person closes either dialog
// or it cannot be shown: the prompt then goes out as typed.
async function askUser($: EngineInterface, questions: readonly Question[]): Promise<Record<string, string> | null> {
  const answers: Record<string, string> = {}
  try {
    for (const [i, q] of askInput(questions).questions.entries()) {
      const header = questions.length > 1 ? `${q.header.slice(0, 8)} ${i + 1}/${questions.length}` : q.header
      answers[q.question] = await $.ui.ask(q.question, { options: q.options.map(o => o.label), header })
    }
    return answers
  } catch {
    return null
  }
}

async function modeOf($: EngineInterface, options: Options): Promise<SharppromptMode> {
  const o = (await $.state.get(modeOverride)).value
  if (o) return o
  const m = options.mode
  return m === 'replace' || m === 'context' || m === 'off' ? m : 'fill'
}

// What sharpprompt would do with this prompt. Anything without a rewritten
// text means the prompt goes out exactly as typed.
async function decide($: EngineInterface, e: PromptSubmitInput, options: Options, mode: SharppromptMode): Promise<SharppromptDecision> {
  const off = mode === 'off' || (await $.state.get(isOff)).value === true
  const g = gate({
    text: e.text,
    origin: e.origin,
    minChars: typeof options.minChars === 'number' ? options.minChars : 40,
    isOff: off,
  })
  if (g.pass) return { verdict: 'skip', reason: g.reason, text: g.text }

  if (endsWithQuestion(await lastReply($))) return { verdict: 'skip', reason: 'answer', text: e.text }

  // The prompt is held while we wait, and nothing else on screen says why:
  // a status line under the box does, and goes as soon as the wait ends.
  try {
    // A long draft goes straight to tidying: the classifier asks whether a
    // prompt is vague, and a long one's trouble is repetition.
    if (isLong(e.text)) {
      $.ui.status(STATUS_REWRITING)
      return { verdict: 'long', text: e.text, rewrite: await rewrite($, e.text, helperModel(options), await rewriteOptions($, options)) }
    }
    $.ui.status(STATUS_CHECKING)
    const t0 = await $.clock.now()
    const verdict = await classify($, e.text, helperModel(options))
    const classifyMs = (await $.clock.now()) - t0
    if (verdict !== 'rough') return { verdict, text: e.text, classifyMs }
    $.ui.status(STATUS_REWRITING)
    return { verdict, text: e.text, classifyMs, rewrite: await rewrite($, e.text, helperModel(options), await rewriteOptions($, options)) }
  } finally {
    $.ui.status(undefined)
  }
}

// The usage log (hooks/log.ts). A failed write never stops the prompt.
const logOn = (options: Options) => options.log !== false

async function readLog($: EngineInterface): Promise<LogRecord[]> {
  const v = await $.store.get('log')
  return Array.isArray(v) ? (v as LogRecord[]) : []
}

async function writeLog($: EngineInterface, list: readonly LogRecord[]) {
  try {
    await $.store.set('log', list.slice(-MAX_LOG))
  } catch {
    // Over the store's size limit: keep the newer half.
    await $.store.set('log', list.slice(-MAX_LOG / 2)).catch(() => {})
  }
}

async function startLog($: EngineInterface, options: Options, d: SharppromptDecision): Promise<string | null> {
  if (!logOn(options)) return null
  try {
    const now = await $.clock.now()
    const list = await readLog($)
    const rec = newRecord(`${now}-${list.length}`, new Date(now).toISOString(), await $.session.model(), d)
    if (!rec) return null
    await writeLog($, [...list, rec])
    return rec.id
  } catch {
    return null
  }
}

async function updateLog($: EngineInterface, id: string | null | undefined, patch: Partial<LogRecord>) {
  if (!id) return
  try {
    const list = await readLog($)
    if (list.some(r => r.id === id)) await writeLog($, patchLog(list, id, patch))
  } catch {}
}

// A prompt sent while our suggestion is waiting is the user's answer to it,
// not a new draft. When they edited it first, the edit is kept as an example
// of how they like their prompts.
async function settlePending($: EngineInterface, text: string): Promise<'as-is' | 'edited' | null> {
  const p = (await $.state.get(pending)).value
  if (!p || p.kind === 'restored') return null
  await $.state.set(pending, null)
  // A sent rewrite's band goes with the next prompt.
  if (p.kind !== 'filled') return null
  if (text === p.rewritten) {
    await updateLog($, p.log, { action: 'as-is' })
    turnLog = p.log ?? null
    return 'as-is'
  }
  if (overlap(text, p.rewritten) < EDIT_OVERLAP) {
    await updateLog($, p.log, { action: 'abandoned' })
    return null
  }
  const list = await exemplarsOf($)
  await $.store.set('exemplars', [...list, { original: p.rewritten, sent: text }].slice(-20)).catch(() => {})
  await updateLog($, p.log, { action: 'edited', sent: clip(text) })
  turnLog = p.log ?? null
  return 'edited'
}

// The counts and records are for /sharp stats only: a store that is full or
// failing must not cost the user a rewrite already paid for.
async function bump($: EngineInterface, add: Counts) {
  try {
    const v = await $.store.get('counts')
    const counts: Counts = v && typeof v === 'object' ? { ...(v as Counts) } : {}
    for (const [k, n] of Object.entries(add)) counts[k] = (counts[k] ?? 0) + n
    await $.store.set('counts', counts)
  } catch {}
}

async function push<T>($: EngineInterface, key: 'rewrites' | 'turns' | 'classified' | 'decisions' | 'late', item: T) {
  try {
    const v = await $.store.get(key)
    const list = Array.isArray(v) ? (v as T[]) : []
    await $.store.set(key, [...list, item].slice(-MAX_RECORDS))
  } catch {}
}

async function readList<T>($: EngineInterface, key: 'rewrites' | 'turns' | 'classified'): Promise<T[]> {
  const v = await $.store.get(key)
  return Array.isArray(v) ? (v as T[]) : []
}

// Times are kept so scripts/token_overhead.mjs can take a window of them.
async function record($: EngineInterface, d: SharppromptDecision, helper: string) {
  const at = await $.clock.now()
  await bump($, { [countKey(d)]: 1 })
  const seen: DecisionRecord = { at, key: countKey(d) }
  await push($, 'decisions', seen)
  if ('classifyMs' in d && d.classifyMs !== undefined) {
    const item: ClassifyRecord = { verdict: d.verdict, ms: d.classifyMs, words: wordCount(d.text), at, model: helper }
    await push($, 'classified', item)
  }
  if (!('rewrite' in d) || !d.rewrite) return
  const r = d.rewrite
  const item: RewriteRecord = {
    outcome: r.outcome,
    via: r.via,
    ms: r.ms,
    classifyMs: d.classifyMs,
    usage: tokens(r.usage),
    ...(r.replyChars === undefined ? {} : { replyChars: r.replyChars }),
    words: r.text ? [wordCount(d.text), wordCount(r.text)] : [wordCount(d.text)],
    model: await $.session.model(),
    at,
    ...(r.via === 'complete' ? { helper } : {}),
  }
  await push($, 'rewrites', item)
}

async function deliver($: EngineInterface, e: PromptSubmitInput, rewritten: string, mode: SharppromptMode, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>, log: string | null = null): Promise<PromptSubmitResult> {
  // VS Code and headless sessions draw no box and no band: there the rewrite
  // can only ride along as context.
  const surface = await $.session.surface()
  const drawn = surface === 'terminal' || surface === 'desktop'
  const how = mode === 'fill' && !drawn ? 'context' : mode

  if (how === 'context') {
    await updateLog($, log, { delivered: 'context', boxed: clip(rewritten) })
    turnLog = log
    outgoing = 'context'
    return next({ ...e, context: [...(e.context ?? []), contextNote(rewritten)] })
  }

  if (how === 'replace') {
    await $.store.set('lastOriginal', e.text).catch(() => {})
    await $.state.set(pending, { kind: 'replaced', original: e.text, rewritten, ...(log ? { log } : {}) })
    await updateLog($, log, { delivered: 'replace', boxed: clip(rewritten) })
    turnLog = log
    outgoing = 'rewritten'
    return next({ ...e, text: rewritten })
  }

  // The box empties on Enter and stays editable while we wait: whatever the
  // person typed there since is theirs, and a fill would wipe it. Their
  // prompt then goes as typed and the new text stays in the box.
  const typedAhead = ((await $.prompt.read().catch(() => null))?.text ?? '').trim() !== ''
  if (typedAhead) {
    await updateLog($, log, { delivered: 'typed' })
    turnLog = log
    outgoing = 'typed'
    return next(e)
  }
  const f0 = await $.clock.now()
  const filled = await $.prompt.fill({ text: rewritten, mode: 'replace' })
  const fillMs = (await $.clock.now()) - f0
  if (!filled.isFilled) {
    await updateLog($, log, { delivered: 'typed' })
    turnLog = log
    outgoing = 'typed'
    return next(e)
  }
  await $.store.set('lastOriginal', e.text).catch(() => {})
  await $.state.set(pending, { kind: 'filled', original: e.text, rewritten, ...(log ? { log } : {}) })
  await updateLog($, log, { delivered: 'fill', boxed: clip(rewritten), fillMs })
  // Since Claude Code 2.1.295 a dropped prompt is put back in the box after
  // our fill, so the box reads rewrite + original. The engine does that before
  // the next timer tick, so one tick later we set the rewrite again. On 2.1.293
  // the box already holds the rewrite alone and nothing happens.
  $.clock.after(0, async () => {
    const p = (await $.state.get(pending)).value
    if (!p || p.kind !== 'filled' || p.rewritten !== rewritten) return
    // Only the engine's own put-back (rewrite, then the original) is undone;
    // anything else in the box was typed by the person.
    const box = (await $.prompt.read()).text
    if (box !== rewritten && box.startsWith(rewritten) && box.includes(e.text.trim())) await $.prompt.fill({ text: rewritten, mode: 'replace' })
  })
  return { drop: DROP_NOTE }
}

// Puts the user's own text back in the box. Sent as it stands, it goes out
// untouched (prompt.submit checks it against pending); edited, it is a new
// prompt. We never send it for them: a prompt a plugin submits shows in the
// transcript under the plugin's name and skips @file expansion. pending is
// written before the fill so an Enter right after it already sees it.
async function restoreOriginal($: EngineInterface, p: SharppromptPending): Promise<boolean> {
  await $.state.set(pending, { ...p, kind: 'restored' })
  await bump($, { 'answer:original': 1 })
  await updateLog($, p.log, { action: 'original' })
  const r = await $.prompt.fill({ text: p.original, mode: 'replace' })
  if (!r.isFilled) await $.state.set(pending, null)
  return r.isFilled
}

// True when this is the user's own text we put back, sent unchanged.
async function isRestored($: EngineInterface, text: string): Promise<boolean> {
  const p = (await $.state.get(pending)).value
  if (!p || p.kind !== 'restored') return false
  await $.state.set(pending, null)
  if (text !== p.original) return false
  turnLog = p.log ?? null
  return true
}

async function runCommand($: EngineInterface, args: string, options: Options): Promise<string> {
  const c = parseCommand(args)
  switch (c.kind) {
    case 'status': {
      const mode = await modeOf($, options)
      const off = (await $.state.get(isOff)).value === true
      const last = (await readList<RewriteRecord>($, 'rewrites')).at(-1)
      return `${off ? 'Off' : 'On'} for this session, mode ${mode}.\nLast prompt: ${describe((await $.state.get(lastDecision)).value ?? null)}\n${lastRewriteLine(last)}`
    }
    case 'on':
      await $.state.set(isOff, false)
      // Mode off (from /sharp mode off or the settings) would keep it off.
      // Mode off from the settings needs an override; one from /sharp mode off
      // is lifted, so a configured replace or context mode comes back.
      if ((await modeOf($, options)) === 'off') await $.state.set(modeOverride, options.mode === 'off' ? 'fill' : null)
      return 'On for this session.'
    case 'off':
      await $.state.set(isOff, true)
      return 'Off for this session. Prompts go out as typed.'
    case 'mode':
      await $.state.set(modeOverride, c.mode)
      return `Mode is ${c.mode} for this session.`
    case 'undo': {
      const original = await $.store.get('lastOriginal')
      if (typeof original !== 'string') return 'Nothing to undo.'
      const ok = await restoreOriginal($, { kind: 'restored', original, rewritten: '' })
      return ok ? 'Your original is back in the prompt box; sent as it stands, it goes out untouched.' : `Could not reach the prompt box. Your original was:\n${original}`
    }
    case 'stats': {
      const v = await $.store.get('counts')
      const counts = v && typeof v === 'object' ? (v as Counts) : {}
      return `${summary(counts, await readList<RewriteRecord>($, 'rewrites'), await readList<TurnRecord>($, 'turns'), await readList<ClassifyRecord>($, 'classified'))}\n${logLine(logOn(options), (await readLog($)).length)}`
    }
    case 'try': {
      const verdict = await classify($, c.text, helperModel(options))
      const r = await rewrite($, c.text, helperModel(options), await rewriteOptions($, options))
      const asks = r.questions?.length ? `\n\nWould ask:\n${r.questions.map(q => `- ${q.question} ${q.options.map(o => o.label).join(' / ')}`).join('\n')}` : ''
      return `classify: ${verdict}\nrewrite: ${r.outcome} via ${r.via} in ${r.ms} ms${r.text ? `\n\n${r.text}` : ''}${asks}`
    }
    case 'help':
      return `${c.error ? `${c.error}\n` : ''}${HELP}`
  }
}

async function submit($: EngineInterface, e: PromptSubmitInput, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>, options: Options): Promise<PromptSubmitResult> {
  const typedByUser = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
  if (typedByUser) {
    if (await isRestored($, e.text)) {
      const d: SharppromptDecision = { verdict: 'skip', reason: 'back-to-mine', text: e.text }
      await $.state.set(lastDecision, d)
      await record($, d, helperModel(options))
      outgoing = 'typed'
      return next(e)
    }
    // raw: in front of our suggestion changes nothing about it; it is
    // taken off before the comparison and before the prompt goes out.
    const sent = e.text.replace(RAW_PREFIX, '')
    const answered = await settlePending($, sent)
    if (answered) {
      await $.state.set(lastDecision, { verdict: 'skip', reason: 'suggested', text: sent })
      await bump($, { [`answer:${answered}`]: 1 })
      outgoing = answered === 'as-is' ? 'rewritten' : 'edited'
      return next(sent === e.text ? e : { ...e, text: sent })
    }
  }
  const mode = await modeOf($, options)
  const d = await decide($, e, options, mode)
  await $.state.set(lastDecision, d)
  if (typedByUser) await record($, d, helperModel(options))
  const log = typedByUser ? await startLog($, options, d) : null
  // Esc put the draft back in the box: sent as it stands, it is the
  // person's own and goes out untouched, with no second wait.
  if ('rewrite' in d && d.rewrite?.outcome === 'aborted') {
    if (typedByUser) await $.state.set(pending, { kind: 'restored', original: e.text, rewritten: '', ...(log ? { log } : {}) })
    return next(e)
  }
  let rewritten = 'rewrite' in d ? d.rewrite?.text : undefined
  let how = mode
  const questions = ('rewrite' in d ? d.rewrite?.questions : undefined) ?? []
  if (rewritten && questions.length) {
    const surface = await $.session.surface()
    if (surface === 'terminal' || surface === 'desktop') {
      const answers = await askUser($, questions)
      if (!answers) {
        await bump($, { 'ask:dismissed': 1 })
        await updateLog($, log, { answers: 'dismissed', delivered: 'typed' })
        turnLog = log
        if (typedByUser) outgoing = 'typed'
        return next(e)
      }
      await bump($, { 'ask:answered': 1 })
      await updateLog($, log, { answers })
      rewritten = applyAnswers(rewritten, questions, answers)
    } else {
      // Nobody to ask: the recommended answers are guesses, so they ride
      // along as context and never replace what the user typed.
      rewritten = recommended(rewritten, questions)
      how = 'context'
    }
  }
  if (rewritten) return deliver($, e, rewritten, how, next, log)
  await updateLog($, log, { delivered: 'typed' })
  turnLog = log
  if (typedByUser) outgoing = 'typed'
  return next(d.text !== e.text ? { ...e, text: d.text } : e)
}

// Whatever happens in here, the prompt goes out. A thrown error lands in
// .catch, which sends it untouched.
export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sharpprompt', description: 'Prompt rewriting: status, on, off, mode, undo, stats, try', argumentHint: '[status|on|off|mode|undo|stats|try]' })
    await $.command.register({ name: 'sharp', description: 'Short for /sharpprompt', argumentHint: '[status|on|off|mode|undo|stats|try]' })
    return next(e)
  })

  on('command.run', { command: 'sharpprompt' }, async ($, e) => ({ text: await runCommand($, e.args, options) }))
  on('command.run', { command: 'sharp' }, async ($, e) => ({ text: await runCommand($, e.args, options) }))

  // A prompt typed over a running turn, or delivered into it (a task
  // notification), carries its turnId: that turn's tool count and record
  // are left as they are, and it is not counted as a turn of its own.
  on('prompt.submit', async ($, e, next) => {
    if (e.turnId === undefined) {
      outgoing = null
      toolCalls = 0
      turnLog = null
      return submit($, e, next, options)
    }
    const kept = { outgoing, turnLog }
    try {
      return await submit($, e, next, options)
    } finally {
      outgoing = kept.outgoing
      turnLog = kept.turnLog
    }
  }).catch(($, e, next) => next(e))

  on('tool.call', ($, e, next) => {
    if (!e.agentId) toolCalls++
    return next(e)
  }).catch(($, e, next) => next(e))

  // One record per turn a typed prompt started, for /sharp stats. Subagent
  // turns and turns nobody typed are left out.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && outgoing) {
      const turn: TurnRecord = {
        prompt: outgoing,
        durationMs: e.durationMs,
        tools: toolCalls,
        asked: endsWithQuestion(e.answer),
        usage: tokens(e.usage),
        aborted: e.isAborted,
      }
      outgoing = null
      await push($, 'turns', turn)
      await updateLog($, turnLog, { turn: { durationMs: turn.durationMs, tools: turn.tools, asked: turn.asked, aborted: turn.aborted } })
      turnLog = null
    }
    if (late.forks > 0) {
      const add = { 'late:forks': late.forks, 'late:input': late.usage.input_tokens + late.usage.cache_read_input_tokens + late.usage.cache_creation_input_tokens, 'late:output': late.usage.output_tokens }
      const item: LateRecord = { at: await $.clock.now(), forks: late.forks, ms: late.ms, model: await $.session.model(), usage: tokens(late.usage) }
      late.forks = 0
      late.ms = []
      late.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      await bump($, add)
      await push($, 'late', item)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = (await $.state.get(pending)).value
    if (!p || p.kind === 'restored' || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const was = p.original.length > 70 ? `${p.original.slice(0, 70)}...` : p.original
    const extra = addedLine(p.original, p.rewritten)
    const note = extra ? <Text color="warning">{extra}</Text> : null
    if (p.kind === 'replaced') {
      return (
        <Box flexDirection="column">
          <Text dimColor>sharpprompt sent a rewrite of: {was}</Text>
          {note}
          <Box>
            <Button key="undo" hotkey="u" label="put my original in the box" onPress={() => restoreOriginal($, p)} />
            <Button key="dismiss" hotkey="x" label="ok" role="dismiss" onPress={() => $.state.set(pending, null)} />
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text dimColor>sharpprompt rewrote: {was}</Text>
        {note}
        <Box>
          <Text dimColor>Enter sends it, or edit it in the box. </Text>
          <Button key="raw" hotkey="r" label="back to mine" onPress={() => restoreOriginal($, p)} />
        </Box>
      </Box>
    )
  })
}
