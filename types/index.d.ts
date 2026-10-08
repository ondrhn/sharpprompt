export type PromptgateMode = 'fill' | 'replace' | 'context' | 'off'

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
    }
  }
}
