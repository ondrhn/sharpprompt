export type PromptgateMode = 'fill' | 'replace' | 'context' | 'off'

// Why the cheap gate let a prompt through untouched.
export type PromptgateSkip =
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
export type PromptgateVerdict = 'clear' | 'rough' | 'timeout' | 'error'

// The last prompt's fate. `text` is what goes out when nothing is rewritten
// (the prompt itself, or with its raw: prefix cut off).
export type PromptgateDecision =
  | { verdict: 'skip'; reason: PromptgateSkip; text: string }
  | { verdict: PromptgateVerdict; text: string }

// A rewrite waiting in the prompt box, shown in the band above it.
export type PromptgatePending = {
  original: string
  rewritten: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    promptgate: {
      pending: PromptgatePending | null
      isOff: boolean
      lastDecision: PromptgateDecision | null
    }
  }
}
