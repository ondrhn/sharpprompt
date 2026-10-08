# Changelog

## Unreleased

- Claude Code 2.1.295 puts a dropped prompt back in the box after the rewrite, so the box read rewrite + original and Enter sent both. sharpprompt now checks the box a moment later and sets the rewrite alone again; a box you already changed is left alone.
- Rewrite records keep the session model; `/sharp status` shows the last rewrite's timings and word counts.

## 0.1.0 (8 October 2026)

- First release: a gate with no model, a Haiku classifier, a rewrite forked from the conversation, and the result put in your prompt box. Nothing is sent for you.
- Modes `fill`, `replace`, `context` and `off`; `/sharpprompt` and `/sharp` with `status`, `stats`, `try`, `undo`.
- Rules for Fable, Opus, Sonnet and Haiku, each linked to its Anthropic source; eight task shapes.
- Measured in two real sessions: fork median 3.1 s (n=6), classifier median 1.0 s (n=9), gate 17 us mean. [Details](docs/measurements/v0.1.0.md).
