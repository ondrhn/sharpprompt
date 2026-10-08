export type SharppromptMode = 'fill' | 'replace' | 'context' | 'off'

// Why the cheap gate let a prompt through untouched.
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

// What the classifier said; 'timeout' and 'error' send the prompt as typed.
export type SharppromptVerdict = 'clear' | 'rough' | 'timeout' | 'error'

// The last prompt's fate. `text` is what goes out when nothing is rewritten
// (the prompt itself, or with its raw: prefix cut off).
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
  | { verdict: SharppromptVerdict; text: string; rewrite?: SharppromptRewrite }

// A rewrite waiting in the prompt box, shown in the band above it.
export type SharppromptPending = {
  original: string
  rewritten: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    sharpprompt: {
      pending: SharppromptPending | null
      isOff: boolean
      lastDecision: SharppromptDecision | null
    }
  }
}
