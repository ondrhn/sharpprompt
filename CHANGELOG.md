# Changelog

## Unreleased

- `scripts/token_overhead.mjs`: sharpprompt's own tokens (rewrites, late forks, classify estimated) against the interactive sessions' tokens in a window, by kind and at API prices. Rewrite, classify and late-fork records now carry their time.
- Usage log: for each rewrite the draft, the rewrite, questions and answers, the text put in the box, what you did with it and the turn that followed; last 300, on your machine only, `Usage log` in `/config` turns it off. `/sharp stats` counts the records; `scripts/export_log.mjs` copies them to a JSONL file and `scripts/usage_report.mjs` summarises one.
- Ask instruction asks for the value the user knows (separator, threshold, count, order, currency, date format); measured on 10 hidden-spec cases ([report](docs/measurements/bench-2026-10-09-v2-ask2.md)) and 10 more written blind to the instruction ([report](docs/measurements/bench-2026-10-10-v2-spec2.md)).
- Benchmark: a hidden-spec-2 corpus of 10 cases from a generator that never saw the instruction (`docs/bench/make_cases_spec2.md`), and `rewrites --ask old|new` to run the old and new instruction on the same cases. Passing checks, prompt as typed / old / new: Sonnet 5.5 1 / 6 / 7, Fable 5.1 2 / 1 / 6.

## 0.2.0 (9 October 2026)

- Ask before sending: when a rough prompt leaves out something the conversation does not answer and that would change the work, up to two questions, each in its own dialog with a recommended answer; closing one sends the prompt as typed. Setting `askBeforeSend`.
- Session facts: the rewriter is told which files this session read or changed and the last failed command, from the transcript only. Setting `sessionFacts`.
- New rule: a reference that fits several things in the conversation means the most recent one, named.
- New setting `rewriteLanguage`: `same` (default) keeps your language, `en` always rewrites into English.
- Benchmark v2: 30 cases where the prompt leaves out something only the user knows, with the rewrite's questions answered by an oracle model. Passing checks went from 13 to 25 of 30 on Sonnet 5.5 and from 12 to 25 on Fable 5.1, all of it in hidden-requirement and remote-reference cases ([Sonnet](docs/measurements/bench-2026-10-09-v2-sonnet-5-5.md), [Fable](docs/measurements/bench-2026-10-09-v2-fable-5-1.md)). The judge's sign test now prints four decimals.

## 0.1.1 (9 October 2026)

- Fixed: on Claude Code 2.1.295 the dropped prompt was added back under the rewrite, so Enter sent both. The box is checked one timer tick after the drop and the rewrite is put back alone.
- Rewrite records keep the session model; `/sharp status` shows the last rewrite's timings and word counts.
- README with illustrations, a demo recording and a FAQ; a gate benchmark test; [measurements](docs/measurements/v0.1.0.md) unchanged from 0.1.0.

## 0.1.0 (8 October 2026)

- First release: a gate with no model, a Haiku classifier, a rewrite forked from the conversation, and the result put in your prompt box. Nothing is sent for you.
- Modes `fill`, `replace`, `context` and `off`; `/sharpprompt` and `/sharp` with `status`, `stats`, `try`, `undo`.
- Rules for Fable, Opus, Sonnet and Haiku, each linked to its Anthropic source; eight task shapes.
- Measured in two real sessions: fork median 3.1 s (n=6), classifier median 1.0 s (n=9), gate 17 us mean. [Details](docs/measurements/v0.1.0.md).
