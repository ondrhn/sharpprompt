import type { Register } from 'claude-code'

// Skeleton: every prompt passes through as typed. The gate, the rewrite and
// the band land in later steps. If a hook here throws, the prompt still goes
// out as typed: this mod never stands between the person and the model.
export const register: Register = on => {
  on('prompt.submit', ($, e, next) => next(e)).catch(($, e, next) => next(e))
}
