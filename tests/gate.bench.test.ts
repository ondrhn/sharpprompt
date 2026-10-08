import { expect, test } from 'claude-code/testing'
import { endsWithQuestion, gate } from '../hooks/gate'

// The cheap gate's cost, with no model involved: what the README's "under
// 1 ms" stands on. Every typed prompt pays this before anything else.
// 100,000 calls in batches of 100; a batch is timed whole because a single
// call is near the clock's resolution. Prints mean and p99 per call.

const ROUGH = 'that question thing u mentioned, is it gonna break when replies end with a code block or smth, look into it'
// A long last reply ending on a question and a code block: the slow path of
// the answer check.
const REPLY = 'word '.repeat(2_000) + 'Want me to run it?\n\n```bash\nnpm test\n```'

test('gate + answer check: mean and p99 per call, 100,000 calls', { timeoutMs: 60_000 }, () => {
  const batches = 1_000
  const per = 100
  const us: number[] = []
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now()
    for (let i = 0; i < per; i++) {
      gate({ text: ROUGH, origin: { kind: 'composer' }, minChars: 40, isOff: false })
      endsWithQuestion(REPLY)
    }
    us.push(((performance.now() - t0) * 1000) / per)
  }
  us.sort((a, b) => a - b)
  const mean = us.reduce((a, b) => a + b, 0) / us.length
  const p99 = us[Math.floor(0.99 * us.length)]!
  console.log(`gate bench: ${batches * per} calls, mean ${mean.toFixed(1)} us, p99 ${p99.toFixed(1)} us per call`)
  expect(p99).toBeLessThan(1_000)
})
