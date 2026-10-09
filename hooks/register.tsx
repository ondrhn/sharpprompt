import type { EngineInterface, ModelUsage, PromptSubmitInput, PromptSubmitResult, Register } from 'claude-code'
import type { SharppromptDecision, SharppromptMode, SharppromptPending, SharppromptRewrite, SharppromptVerdict } from '../types'
import { contextNote, describe, DROP_NOTE, EDIT_OVERLAP, HELP, overlap, parseCommand } from './flow'
import { endsWithQuestion, gate } from './gate'
import { countKey, lastRewriteLine, MAX_RECORDS, summary, tokens, wordCount, type ClassifyRecord, type Counts, type RewriteRecord, type TurnRecord } from './stats'
import { clean, completePrompt, familyOf, forkPrompt, type Exemplar, type Recent, type RewriteOptions } from './rewrite'

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

type Options = Readonly<Record<string, unknown>>

export const CLASSIFY_MS = 2_500

// The labels the classifier picks from; the wording is what it judges by.
const CLEAR = 'clear and specific'
const ROUGH = 'rough: vague or missing what to deliver'
export const REWRITE_MS = 5_000

// Tokens a fork spent after it lost its race: it finished in the background
// and was billed anyway. Read out by the stats in a later step.
export const late = { forks: 0, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }

function addLate(u: ModelUsage) {
  late.forks++
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
  const forked = await race($, forking, REWRITE_MS)
  if (forked === TIMEOUT) {
    void forking.then(r => ('usage' in r ? addLate(r.usage) : undefined), () => {})
    return { outcome: 'timeout', via: 'fork', ms: await took() }
  }

  let reply = forked
  let via: 'fork' | 'complete' = 'fork'
  if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
    via = 'complete'
    reply = await $.model.complete({
      model: helper,
      prompt: completePrompt(draft, family, await recent($), examples, opts),
      maxTokens: 600,
      effort: 'low',
      timeoutMs: REWRITE_MS,
    })
    if (!reply.isAnswered && reply.reason === 'aborted') return { outcome: 'timeout', via, ms: await took() }
  }
  if (!reply.isAnswered) return { outcome: 'error', via, ms: await took(), detail: reply.reason }

  const c = clean(reply.text, draft)
  const ms = await took()
  if ('rejected' in c) return { outcome: c.rejected, via, ms, usage: reply.usage }
  return { outcome: 'rewritten', via, ms, usage: reply.usage, text: c.rewritten }
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
const rewriteOptions = (options: Options): RewriteOptions => ({ language: options.rewriteLanguage === 'en' ? 'en' : 'same' })

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

  const t0 = await $.clock.now()
  const verdict = await classify($, e.text, helperModel(options))
  const classifyMs = (await $.clock.now()) - t0
  if (verdict !== 'rough') return { verdict, text: e.text, classifyMs }
  return { verdict, text: e.text, classifyMs, rewrite: await rewrite($, e.text, helperModel(options), rewriteOptions(options)) }
}

// A prompt sent while our suggestion is waiting is the user's answer to it,
// not a new draft. When they edited it first, the edit is kept as an example
// of how they like their prompts.
async function settlePending($: EngineInterface, text: string): Promise<'as-is' | 'edited' | null> {
  const p = (await $.state.get(pending)).value
  if (!p || p.kind !== 'filled') return null
  await $.state.set(pending, null)
  if (text === p.rewritten) return 'as-is'
  if (overlap(text, p.rewritten) < EDIT_OVERLAP) return null
  const list = await exemplarsOf($)
  await $.store.set('exemplars', [...list, { original: p.rewritten, sent: text }].slice(-20))
  return 'edited'
}

async function bump($: EngineInterface, add: Counts) {
  const v = await $.store.get('counts')
  const counts: Counts = v && typeof v === 'object' ? { ...(v as Counts) } : {}
  for (const [k, n] of Object.entries(add)) counts[k] = (counts[k] ?? 0) + n
  await $.store.set('counts', counts)
}

async function push<T>($: EngineInterface, key: 'rewrites' | 'turns' | 'classified', item: T) {
  const v = await $.store.get(key)
  const list = Array.isArray(v) ? (v as T[]) : []
  await $.store.set(key, [...list, item].slice(-MAX_RECORDS))
}

async function readList<T>($: EngineInterface, key: 'rewrites' | 'turns' | 'classified'): Promise<T[]> {
  const v = await $.store.get(key)
  return Array.isArray(v) ? (v as T[]) : []
}

async function record($: EngineInterface, d: SharppromptDecision) {
  await bump($, { [countKey(d)]: 1 })
  if ('classifyMs' in d && d.classifyMs !== undefined) {
    const item: ClassifyRecord = { verdict: d.verdict, ms: d.classifyMs, words: wordCount(d.text) }
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
    words: r.text ? [wordCount(d.text), wordCount(r.text)] : [wordCount(d.text)],
    model: await $.session.model(),
  }
  await push($, 'rewrites', item)
}

async function deliver($: EngineInterface, e: PromptSubmitInput, rewritten: string, mode: SharppromptMode, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>): Promise<PromptSubmitResult> {
  // VS Code and headless sessions draw no box and no band: there the rewrite
  // can only ride along as context.
  const surface = await $.session.surface()
  const drawn = surface === 'terminal' || surface === 'desktop'
  const how = mode === 'fill' && !drawn ? 'context' : mode

  if (how === 'context') {
    outgoing = 'context'
    return next({ ...e, context: [...(e.context ?? []), contextNote(rewritten)] })
  }

  if (how === 'replace') {
    await $.store.set('lastOriginal', e.text)
    await $.state.set(pending, { kind: 'replaced', original: e.text, rewritten })
    outgoing = 'rewritten'
    return next({ ...e, text: rewritten })
  }

  const filled = await $.prompt.fill({ text: rewritten, mode: 'replace' })
  if (!filled.isFilled) {
    outgoing = 'typed'
    return next(e)
  }
  await $.store.set('lastOriginal', e.text)
  await $.state.set(pending, { kind: 'filled', original: e.text, rewritten })
  // Since Claude Code 2.1.295 a dropped prompt is put back in the box after
  // our fill, so the box reads rewrite + original. The engine does that before
  // the next timer tick, so one tick later we set the rewrite again. On 2.1.293
  // the box already holds the rewrite alone and nothing happens.
  $.clock.after(0, async () => {
    const p = (await $.state.get(pending)).value
    if (!p || p.kind !== 'filled' || p.rewritten !== rewritten) return
    if ((await $.prompt.read()).text !== rewritten) await $.prompt.fill({ text: rewritten, mode: 'replace' })
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
  const r = await $.prompt.fill({ text: p.original, mode: 'replace' })
  if (!r.isFilled) await $.state.set(pending, null)
  return r.isFilled
}

// True when this is the user's own text we put back, sent unchanged.
async function isRestored($: EngineInterface, text: string): Promise<boolean> {
  const p = (await $.state.get(pending)).value
  if (!p || p.kind !== 'restored') return false
  await $.state.set(pending, null)
  return text === p.original
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
      return summary(counts, await readList<RewriteRecord>($, 'rewrites'), await readList<TurnRecord>($, 'turns'), await readList<ClassifyRecord>($, 'classified'))
    }
    case 'try': {
      const verdict = await classify($, c.text, helperModel(options))
      const r = await rewrite($, c.text, helperModel(options), rewriteOptions(options))
      return `classify: ${verdict}\nrewrite: ${r.outcome} via ${r.via} in ${r.ms} ms${r.text ? `\n\n${r.text}` : ''}`
    }
    case 'help':
      return `${c.error ? `${c.error}\n` : ''}${HELP}`
  }
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

  on('prompt.submit', async ($, e, next) => {
    const typedByUser = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    outgoing = null
    toolCalls = 0
    if (typedByUser) {
      if (await isRestored($, e.text)) {
        const d: SharppromptDecision = { verdict: 'skip', reason: 'back-to-mine', text: e.text }
        await $.state.set(lastDecision, d)
        await record($, d)
        outgoing = 'typed'
        return next(e)
      }
      const answered = await settlePending($, e.text)
      if (answered) {
        await $.state.set(lastDecision, { verdict: 'skip', reason: 'suggested', text: e.text })
        await bump($, { [`answer:${answered}`]: 1 })
        outgoing = answered === 'as-is' ? 'rewritten' : 'edited'
        return next(e)
      }
    }
    const mode = await modeOf($, options)
    const d = await decide($, e, options, mode)
    await $.state.set(lastDecision, d)
    if (typedByUser) await record($, d)
    const rewritten = 'rewrite' in d ? d.rewrite?.text : undefined
    if (rewritten) return deliver($, e, rewritten, mode, next)
    if (typedByUser) outgoing = 'typed'
    return next(d.text !== e.text ? { ...e, text: d.text } : e)
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
    }
    if (late.forks > 0) {
      const add = { 'late:forks': late.forks, 'late:input': late.usage.input_tokens + late.usage.cache_read_input_tokens + late.usage.cache_creation_input_tokens, 'late:output': late.usage.output_tokens }
      late.forks = 0
      late.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      await bump($, add)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = (await $.state.get(pending)).value
    if (!p || p.kind === 'restored' || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const was = p.original.length > 70 ? `${p.original.slice(0, 70)}...` : p.original
    if (p.kind === 'replaced') {
      return (
        <Box flexDirection="column">
          <Text dimColor>sharpprompt sent a rewrite of: {was}</Text>
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
        <Box>
          <Text dimColor>Enter sends it, or edit it in the box. </Text>
          <Button key="raw" hotkey="r" label="back to mine" onPress={() => restoreOriginal($, p)} />
        </Box>
      </Box>
    )
  })
}
