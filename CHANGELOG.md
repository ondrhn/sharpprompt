# Changelog

## 0.1.1 (9 October 2026)

- Fixed: on Claude Code 2.1.295 the dropped prompt was added back under the rewrite, so Enter sent both. The box is checked one timer tick after the drop and the rewrite is put back alone.
- Rewrite records keep the session model; `/sharp status` shows the last rewrite's timings and word counts.
- README with illustrations, a demo recording and a FAQ; a gate benchmark test; [measurements](docs/measurements/v0.1.0.md) unchanged from 0.1.0.

## 0.1.0 (8 October 2026)

- First release: a gate with no model, a Haiku classifier, a rewrite forked from the conversation, and the result put in your prompt box. Nothing is sent for you.
- Modes `fill`, `replace`, `context` and `off`; `/sharpprompt` and `/sharp` with `status`, `stats`, `try`, `undo`.
- Rules for Fable, Opus, Sonnet and Haiku, each linked to its Anthropic source; eight task shapes.
- Measured in two real sessions: fork median 3.1 s (n=6), classifier median 1.0 s (n=9), gate 17 us mean. [Details](docs/measurements/v0.1.0.md).
