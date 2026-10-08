export type SharppromptMode = 'fill' | 'replace' | 'context' | 'off'

// Why the cheap gate let a prompt through untouched. 'suggested' is a prompt
// sent while our suggestion was in the box: the user's answer to it.
export type SharppromptSkip =
  | 'off'
  | 'not-typed'
  | 'raw'
  | 'command'
  | 'heading'
  | 'too-short'
  | 'too-long'
  | 'harness-tag'
  | 'answer'
  | 'suggested'
  | 'back-to-mine'

// What the classifier said; 'timeout' and 'error' send the prompt as typed.
export type SharppromptVerdict = 'clear' | 'rough' | 'timeout' | 'error'

// How a rewrite went. Only 'rewritten' carries text; every other outcome
// sends the prompt as typed.
export type SharppromptRewrite = {
  outcome: 'rewritten' | 'keep' | 'same' | 'empty' | 'too-long' | 'timeout' | 'error'
  via: 'fork' | 'complete'
  ms: number
  text?: string
  detail?: string
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
}

export type SharppromptDecision =
  | { verdict: 'skip'; reason: SharppromptSkip; text: string }
  | { verdict: SharppromptVerdict; text: string; classifyMs?: number; rewrite?: SharppromptRewrite }

// A rewrite the user has not acted on yet: in the box (filled) or already
// sent (replaced), shown in the band; or the user's own text put back in the
// box (restored), which goes out untouched if sent as it stands.
export type SharppromptPending = {
  kind: 'filled' | 'replaced' | 'restored'
  original: string
  rewritten: string
}

declare module 'claude-code' {
  interface PluginState {
    sharpprompt: {
      pending: SharppromptPending | null
      isOff: boolean
      mode: SharppromptMode | null
      lastDecision: SharppromptDecision | null
    }
  }
}
