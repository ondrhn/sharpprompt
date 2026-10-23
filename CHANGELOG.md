# Changelog

## Unreleased

- A number inside a longer one no longer hides it: with "2 failing tests, line 120" a rewrite that drops the 2 is turned down. Anchors match whole tokens; numbers keep all their groups (2.1.296, 1,000,000), file names and paths take any script's letters (çalışma.py), "500 ms" may become "500ms".
- Anchors no longer take and/or, w/o or login/logout for paths, inline list markers like 1) and 2) for numbers, the words between two one-character quotes, or the backtick after a URL.
- A rewrite that asks about a value from the draft (retry 3 or 5 times) is no longer turned down for leaving the value to the question. A question that cannot be shown (malformed, a third one, an option over 200 characters) turns the rewrite down, since its point is missing from the body.
- Esc while sharpprompt waits is recorded as `aborted`, and the draft put back goes out untouched when sent, with no second wait.
- Text typed into the box during the wait is no longer wiped by the rewrite: the prompt then goes as typed.
- KEEP in bold, in backticks or with a reason after it is no rewrite.
- The fallback completion (first prompt, or after /clear) gets room for a long draft's tidy instead of 600 tokens.
- A prompt typed over a running turn or a task notification no longer erases that turn's record.
- Edits are told from new prompts by words of any script; two texts with no words are not an edit.
- `/sharp on` after `/sharp mode off` brings back the configured mode.
- A full or failing plugin store no longer costs a rewrite: the stats are best effort, the suggestion still reaches the box.
- With nobody to ask (VS Code, headless), a rewrite that came with questions goes as context even in replace mode, so guessed answers never replace what was typed.
- In replace mode the band of a sent rewrite goes away with the next prompt.
- `/sharp on` after `/sharp mode off` (or mode off in the settings) turns rewriting back on.
- `raw:` typed in front of a suggestion is taken off; the suggestion goes out as is and is not kept as an edit.
- Scripts find the project folder with `fileURLToPath`, so paths with spaces or non-ASCII letters work.
- A rewrite gets 10 seconds, not 5, before the prompt goes out as typed (still plus 100 ms a word past 20, at most 25). From 12 to 23 October 32 of 79 rewrites of short drafts timed out at 5 seconds; the forks that lost took 7.5 seconds at the median.
- The band names what the rewrite brought in that the draft did not have: paths, file names, URLs, commit hashes and numbers of two digits or more. On the 29 rewrites in the author's usage log it would have shown on 10, one of them a stale commit hash.
- Long prompts (60 words or more) skip the classifier and are tidied instead of rewritten: repeats merged, requests in order, nothing added, no longer than the draft ([report](docs/measurements/tidy-2026-10-11.md)).
- A rewrite that drops a number, file name, path, URL, or quoted or code text from the draft is thrown away (outcome `lost`).
- Longer prompts get longer to be rewritten: 5 seconds plus 100 ms a word past 20, at most 25. In two days of use 15 of 40 rough prompts timed out, most of them long. Late fork records keep how long each fork took.
- The status line no longer repeats the plugin's name, and says that Esc puts your draft back.
- `scripts/clear_rules.mjs`: candidate rules for letting plainly clear prompts skip the classifier, with a labelling and evaluation step. None was added: on 300 real prompts all of them together would have skipped 11.3% of classifier calls, under the 15% bar ([report](docs/measurements/latency-2026-10-10.md)).
- Rewrite records keep the reply's length before cleaning, and the usage log keeps how long filling the box took, to see where the wait and the output tokens go.
- A status line under the prompt box while sharpprompt checks or rewrites a prompt, cleared when the wait ends on every path.
- CI: a GitHub Actions workflow runs validate, the plugin tests, the bank check and the script tests on each push and pull request; `tsc` stays local.
- README: a When it helps section, from the measurements: no difference on ordinary prompts, a gain when the prompt leaves out something only you know, and what it costs per prompt.
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
