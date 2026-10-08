// Lets Node 22 (with --experimental-strip-types) import the plugin's own
// TypeScript, whose relative imports have no extension: './bank' -> './bank.ts'.
import { register } from 'node:module'

const hook = `
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL) {
    const url = new URL(spec + '.ts', ctx.parentURL)
    if (existsSync(fileURLToPath(url))) return next(url.href, ctx)
  }
  return next(spec, ctx)
}`

register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url)
