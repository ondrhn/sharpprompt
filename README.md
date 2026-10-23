# sharpprompt

Rough prompt in. Clear prompt in your box. You press Enter.

![A small black creature at a desk rewrites a crumpled note with the chat beside it, while most notes fly straight past into the prompt box](https://raw.githubusercontent.com/ondrhn/sharpprompt/master/docs/illustrations/01b-sharpener-detailed.png)

[![test](https://github.com/ondrhn/sharpprompt/actions/workflows/test.yml/badge.svg)](https://github.com/ondrhn/sharpprompt/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE) [![Claude Code 2.1.293+](https://img.shields.io/badge/Claude%20Code-2.1.293%2B-orange)](https://docs.claude.com/en/docs/claude-code)

## What is this

sharpprompt is a Claude Code mod that looks at each prompt you type before it goes out, and lets most of them through untouched.
When one is rough (vague, missing what you want back, leaning on "that thing above"), it rewrites it with the conversation in view and puts the rewrite in your prompt box.
You press Enter, edit it, or take your own text back; it never sends anything for you.

## When it helps

On ordinary prompts it makes no measurable difference. We ran 30 everyday cases on Fable 5.1 and Sonnet 5.5, the prompt as typed against the rewrite, and neither the checks nor a blind judge found one.

It helps when the prompt leaves out something only you know. That can be a requirement you never wrote down, like the separator another team's import wants, or a vague pointer back into a long conversation ("that thing above"). On 30 cases built that way, passing checks went from 13 to 25 on Sonnet 5.5 and from 12 to 25 on Fable 5.1. All of the gain came from those two kinds; on the third kind in that set, the session's last failed test, the model did as well without the rewrite. On 10 later cases, written by a model that never saw the rewrite instructions, the rewrite passed 7 and 6 of 10, the prompt as typed 1 and 2.

The cost: each prompt that gets past the gate goes to Haiku for a clear-or-rough label (about a second), and a rough one is rewritten by a fork of your session's model (about three seconds, reading the conversation from the prompt cache).

If you type short commands, or already spell out what you want, you will get little from it.

## What it looks like

From a real session. The conversation had just covered `hooks/gate.ts`, and this was typed:

```
that question thing u mentioned, is it gonna break when replies end with a code block or smth, look into it
```

The prompt was held back, and the box filled with:

```
Will `endsWithQuestion()` in hooks/gate.ts break when Claude's reply ends with a code block or something similar?
Look into it and tell me which endings it gets wrong, with an example for each. Don't change anything yet.
```

Above the box:

```
sharpprompt rewrote: that question thing u mentioned, is it gonna break when replies end wi...
Enter sends it, or edit it in the box. [ back to mine ]
```

"u mentioned" became the function and file the conversation was about.

`ctrl+x r` (once bound, see [Install](#install)), `r` after ctrl+x tab, or a click on `[ back to mine ]` puts your own text back; the band then says so, and that text goes out as you send it, edited or not, with no second rewrite.

![Recording: a rough prompt is typed, the rewrite appears in the prompt box with a note above it, Enter sends it and Claude starts on the fix](https://raw.githubusercontent.com/ondrhn/sharpprompt/master/docs/demo.gif)

Recorded with [vhs](docs/demo.tape) on Claude Code 2.1.295.

## How it works

![Three stations on a conveyor: a turnstile with a stopwatch, a scale that sends clear notes out a door, and a desk where rough notes are rewritten; a red belt underneath carries stalled notes through as typed](https://raw.githubusercontent.com/ondrhn/sharpprompt/master/docs/illustrations/02b-three-gates-detailed.png)

1. A gate with no model lets through slash commands, `#` lines, prompts under 40 characters, pastes over 20,000, anything you did not type (task notifications, other sessions, plugins), and your answer to a question Claude just asked. It takes about 17 microseconds per prompt on a desktop CPU (mean of 100,000 calls; see [tests/gate.bench.test.ts](tests/gate.bench.test.ts)).
2. A small model (Haiku by default) labels the rest clear or rough, with a 2.5 second limit. Clear goes out as typed. A prompt of 60 words or more skips this step and goes to 3 to be tidied: repeats merged, requests put in order and numbered, nothing added, never longer than you wrote it.
3. A rough prompt is rewritten by your session's own model, forked from the conversation so it can resolve references, and put in your box. If the model thinks the draft is fine, nothing changes. A rewrite that drops a number, file name, path, URL, or quoted or code text from your draft is thrown away and your prompt goes out as typed.
4. Since 0.2: when the draft leaves out something the conversation does not answer and that would change the work (which file, which of two behaviours, a format), the rewriter may ask, at most two questions, each in its own dialog with its recommended answer first. Your answers are added to the rewrite. Close a dialog and your prompt goes out as typed. It also reads, from the transcript only, which files this session read or changed and the last command that failed, so "that file" and "fix that" can be named.

While the prompt is held, a line under the box says `sharpprompt: checking` or `sharpprompt: rewriting`, and goes when the wait ends. Esc ends the wait and puts your draft back in the box, unsent. When the rewrite carries a path, file name, URL, commit hash or number of two digits or more that you did not type, the band names it (`not in your draft: ...`), so a stale one taken from earlier in the conversation is caught before it goes out.

Anything that fails sends your prompt as typed.

## Install

Inside Claude Code:

```
/plugin marketplace add ondrhn/sharpprompt
/plugin install sharpprompt@ondrhn
```

Or from a clone:

```sh
git clone https://github.com/ondrhn/sharpprompt ~/sharpprompt
claude --plugin-dir ~/sharpprompt
```

To load the clone in every session, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.

To take your own text back with `ctrl+x r` straight from the prompt box, with no ctrl+x tab first, add this to `~/.claude/keybindings.json` (merge it into the file if you have one):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    { "context": "Chat", "bindings": { "ctrl+x r": "app:cycleDiffBase" } }
  ]
}
```

A plugin cannot bind keys of its own: its buttons answer the chord of one of Claude Code's actions. `app:cycleDiffBase` only does anything in the diff sidebar, so from the prompt box its chord reaches the band. While the diff sidebar is open, ctrl+x r cycles the diff base there instead. ctrl+r is not used because it is Claude Code's history search.

## Commands

`/sharpprompt`, or `/sharp` for short:

| | |
|---|---|
| `status` | on or off, the mode, what happened to the last prompt |
| `on`, `off` | for this session |
| `mode fill\|replace\|context\|off` | for this session; the default is set in `/config` |
| `undo` | puts your last original back in the box |
| `stats` | what sharpprompt has done so far (see Measurements) |
| `try <prompt>` | shows the rewrite without sending anything |

`Ask before sending` and `Session facts` in `/config` turn the 0.2 helpers off. The `Rewrite language` setting in `/config` keeps the rewrite in the language you wrote in (`same`, the default) or always writes it in English (`en`), for when you type in another language and want Claude to get a clear English prompt.

Usage log: for each prompt that goes to the rewriter, sharpprompt keeps your draft, the rewrite, any questions and your answers, the text it put in the box, what you did with it (sent as is, edited, took yours back, typed something else) and the length of the turn that followed. The last 300 stay in the plugin's store on your machine and nothing sends them anywhere. `/sharp stats` says how many there are; `node scripts/export_log.mjs` copies them into a JSONL file under `docs/measurements/usage/`, and `node scripts/usage_report.mjs <file>` turns that into a markdown summary. `Usage log` in `/config` turns it off.

Modes: `fill` (default) puts the rewrite in the box. `replace` sends the rewrite and shows your original above the box with a way back. `context` sends your prompt as typed and gives Claude the rewrite beside it as a note.

## What it reaches

![The creature sits in a glass booth with only your prompt and the chat; files, keys, the network, a shell and a mailbox stand outside, each crossed out in red](https://raw.githubusercontent.com/ondrhn/sharpprompt/master/docs/illustrations/03b-glass-booth-detailed.png)

`claude plugin validate --strict .` on this repository:

```
Validating marketplace manifest: .claude-plugin/marketplace.json

Validating plugin: .claude-plugin/plugin.json

  ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
  ❯ types ./types/index.d.ts declares state: sharpprompt.pending, sharpprompt.isOff, sharpprompt.mode, sharpprompt.lastDecision

Validating hooks: hooks/hooks.json

  ❯ ./register.tsx hooks: session.start, command.run{command=sharpprompt}, command.run{command=sharp}, prompt.submit, tool.call, turn.complete, ui.render{component=AbovePrompt}
  ❯ ./register.tsx answers its own command: command.run{command=sharpprompt}
  ❯ ./register.tsx answers its own command: command.run{command=sharp}
  ❯ ./register.tsx gating hook with .catch: prompt.submit
  ❯ ./register.tsx gating hook with .catch: tool.call
  ❯ ./register.tsx calls: $.clock.after (via deliver), $.clock.now, $.clock.sleep (via race), $.command.register, $.model.classify (via classify), $.model.complete (via rewrite), $.model.fork (via rewrite), $.prompt.fill (via deliver, restoreOriginal), $.prompt.read (via deliver), $.session.messages (via lastReply, recent, rewriteOptions), $.session.model, $.session.surface, $.state.get, $.state.set, $.store.get (via bump, exemplarsOf, push, readList, readLog, runCommand), $.store.set (via bump, deliver, push, settlePending, writeLog), $.ui.ask (via askUser), $.ui.resolve
  ❯ ./register.tsx state writes: sharpprompt.isOff, sharpprompt.lastDecision, sharpprompt.mode, sharpprompt.pending
  ❯ ./register.tsx state reads: sharpprompt.isOff, sharpprompt.lastDecision, sharpprompt.mode, sharpprompt.pending

✔ Validation passed
```

That is the whole list: the model, the prompt box, the question dialog, the session's messages and model, its own state and store (the usage log included), the clock, its two commands and the band above the box. A prompt rewriter sees everything you type, so you should be able to check that it cannot send it anywhere.

## Rules

The rewriter gets a short rule set chosen by your session's model family:

- Every model: keep your intent and invent nothing, give the reason when the conversation shows it, name the deliverable and when it is done, keep a question a question, and never ask the model to show its reasoning (Fable and Opus 5.5 can refuse that).
- Fable: one brief instruction over a list, ask for progress updates on long tasks, state the assumption when the request is ambiguous.
- Opus: no extra "verify your work" step, hold the scope, say how long a document should be.
- Sonnet: spell out how far an instruction reaches, say when you want only the change.
- Haiku: ask for a real check before calling a code change done.

Each rule is in [docs/rules](docs/rules) with a link to the Anthropic page it comes from. Two are ours rather than Anthropic's and say so: no role lines ("You are an expert..."), and a length limit (twice your prompt or 60 words, whichever is more, at most 180). [docs/shapes](docs/shapes) has what a good prompt of each kind carries (fix, investigate, build, refactor, research, review, write, ask), with one example each.

## Limits

- The rewrite runs on your session's model, so it costs what a short question to that model costs; the conversation part comes from the prompt cache while it is warm. `/sharp stats` shows the tokens per rough prompt. The `Helper model` setting picks only the classifier and the fallback used before the conversation has a first reply.
- Claude Code's fork has no time limit, so sharpprompt stops waiting after 10 seconds, plus 100 ms for each word past 20 (at most 25 seconds), and sends your prompt as typed. The fork still finishes in the background and is billed, with no cap on its output. `/sharp stats` counts these.
- VS Code and headless runs (`claude -p`, the SDK) have no box to fill, so `fill` acts as `context` there. Mods do not run in a Desktop session that uses WSL.
- Taking your own text back is a chord and Enter: `ctrl+x r` (with the binding above) or ctrl+x tab then `r` puts it in the box, Enter sends it. sharpprompt does not send it for you because a prompt a plugin sends shows under the plugin's name in the transcript and skips `@file` expansion. The band's buttons answer to their keys once the band has focus: ctrl+x tab, or a click.
- A rough prompt waits for the classifier and the rewrite before anything happens. In the sessions measured so far the box filled 3.6 to 6.2 seconds after Enter.

## Measurements

| version | date | prompts | gate (mean) | classifier p50 | rewrite p50 | timeouts |
|---|---|---|---|---|---|---|
| [0.1.0](docs/measurements/v0.1.0.md) | 8 Oct 2026 | 19 typed, 8 rewritten | 17 us | 1.0 s (n=9) | 3.1 s (n=6) | 0 |

Benchmark, 30 cases, the prompt as typed against the rewrite: no measurable difference on Fable 5.1 (26 paired cases, [report](docs/measurements/bench-2026-10-09-fable-5-1.md)) or on Sonnet 5.5 (30 paired cases, [report](docs/measurements/bench-2026-10-09-sonnet-5-5.md)). A blind judge found none either. With Turkish drafts rewritten into English (Sonnet 5.5), task success and judge scores stayed the same while output tokens and time went down, mostly because the answers came back in English ([report](docs/measurements/bench-2026-10-09-tr-sonnet-5-5.md)). On a second corpus of 30 cases built so the model lacks something only the user knows (an unstated requirement, a vague pointer back into a long conversation, the session's last test run), the rewrite, with its questions answered by a model that knows what the user meant, raised passing checks from 13 to 25 on Sonnet 5.5 and from 12 to 25 on Fable 5.1, all of it in the first two kinds of case ([Sonnet](docs/measurements/bench-2026-10-09-v2-sonnet-5-5.md), [Fable](docs/measurements/bench-2026-10-09-v2-fable-5-1.md)). On ten new hidden-spec cases, written by a model that never saw the rewrite instructions, the rewritten prompt passed 7 of 10 checks on Sonnet 5.5 and 6 on Fable 5.1, against 1 and 2 for the prompt as typed ([report](docs/measurements/bench-2026-10-10-v2-spec2.md)).

Token overhead over two days of the author's own use (9 to 11 Oct 2026, 63 prompts typed, 25 rewritten and 15 more timed out, their forks still billed): the plugin's calls came to 11.9 million tokens against 155.9 million for the sessions themselves, 7.6% more, and at API list prices 8.60 USD against 73.94, 11.6% more. 96% of the rewrite input was read from the prompt cache, and the plugin's output was 2% of the sessions' ([report](docs/measurements/token-overhead-2026-10-11.md), `node scripts/token_overhead.mjs` to measure your own).

Each version gets a file in [docs/measurements](docs/measurements) with the method and the raw table, and a row here. The rewrites in the benchmark were written by Haiku; the plugin forks the session model. `/sharp stats` keeps the same numbers for your own sessions, on your machine only, and compares turns that started from your text with turns that started from a rewrite.

Tests: 106 in [tests/](tests), run with `claude plugin test .`, and 4 for the scripts, run with `node --test scripts/usage.node-test.mjs`. Both run on every push and pull request ([test workflow](.github/workflows/test.yml)).

## FAQ

### Does it send anything for me?
No. In the default mode the rewrite waits in your box until you press Enter. Only `replace` mode, which you turn on yourself, sends the rewrite in place of your text.

### Why did it leave my prompt alone?
Most prompts pass: short ones, commands, answers to Claude's questions, and anything the classifier calls clear. `/sharp status` says which reason applied to the last one.

### What does a rewrite cost?
One classifier call on the helper model for each prompt that passes the gate, and for a rough prompt one fork on your session's model. In the 0.1.0 measurements that fork used about 2,500 input tokens outside the cache, 64,000 read from the cache and 230 output tokens. Over two days of longer sessions it averaged about 296,000 tokens per rewrite, nearly all cache reads, and added 11.6% to the sessions' API price. `/sharp stats` shows your own numbers.

### Can I turn it off for one prompt?
Start the prompt with `raw:`. The prefix is removed and the rest goes out as typed. `/sharp off` turns it off for the session.

### Which languages does it work in?
Any language your session's model reads. The classifier and the rewriter are models, so there is no word list to match, and by default the rewrite comes back in the language you typed. Set `Rewrite language` to `en` to get an English prompt from a draft in another language. Numbers, paths and file names are checked in any script (`çalışma.py`, `2,5`), and an edit of a suggestion is recognised in Cyrillic, Chinese or Japanese as well as in Latin letters. The rules the rewriter follows are written in English. What has been measured: the benchmarks are in English plus one Turkish set, and 232 of the author's 238 logged prompts were Turkish. Other languages are untested.

### Does it work in VS Code?
The hooks run, but VS Code has no box for the mod to fill and no band, so the rewrite goes to Claude as a note beside your prompt (`context` mode) and your prompt goes out as typed.

## Development

Types come from the Claude Code build you run. Open an interactive session with the plugin once (`claude --plugin-dir .`) and the engine writes them to `.claude-plugin/types/` (git-ignored); `tsconfig.json` extends the one written there. After a Claude Code update, open it again.

Rules and shapes live in `docs/`; `node scripts/build-bank.mjs` compiles them into `hooks/bank.ts`, because a mod cannot read files at run time. `--check` fails when the two drift.

Checks: `claude plugin validate --strict .`, `claude plugin test .`, `tsc -p .`, `node scripts/build-bank.mjs --check`, and for the export, report and token overhead scripts `node --test scripts/usage.node-test.mjs`. CI runs all of them but `tsc`, on Claude Code 2.1.296; none needs a login. `tsc` runs locally only, because the types it checks against are written when the plugin loads in a signed-in session.

Benchmark: `node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs --help`; the corpus and how to run it are in [docs/bench](docs/bench).

## License

MIT. See [LICENSE](LICENSE).
