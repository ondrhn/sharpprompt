# sharpprompt

A Claude Code mod that looks at each prompt you type before it is sent. Most prompts go through untouched.
When one is rough (vague, missing what you want back, leaning on "that thing above"), sharpprompt rewrites it with the conversation in view and puts the rewrite in your prompt box.
You read it, then press Enter, edit it, or take your own text back. It never sends anything for you.
It reads your prompt and the conversation, and nothing else: no files, no shell, no network, no environment.
Rewrites follow Anthropic's prompting guidance for the model your session runs on, with each rule linked to its source.

## Install

Tested on Claude Code 2.1.293.

```sh
git clone <this repository> ~/sharpprompt
claude --plugin-dir ~/sharpprompt
```

To load it in every session, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.

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

"u mentioned" became the function and file the conversation was about. The rewrite took 1.7 seconds.

## How it decides

1. Cheap checks, no model: slash commands, `#` lines, prompts under 40 characters, pastes over 20,000, anything not typed by you (task notifications, other sessions, plugins), and your answer to a question Claude just asked all go through untouched. Start a prompt with `raw:` to skip sharpprompt once.
2. A small model (Haiku by default) labels the rest clear or rough, with a 2.5 second limit. Clear goes through.
3. A rough prompt is rewritten by your session's own model, forked from the conversation so it can resolve references. If the model thinks the draft is fine, it says so and nothing changes.

Anything that fails or runs out of time sends your prompt as typed.

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

Modes: `fill` (default) puts the rewrite in the box. `replace` sends the rewrite and shows your original above the box with a way back. `context` sends your prompt as typed and gives Claude the rewrite beside it as a note.

## What it reaches

`claude plugin validate --strict .` on this repository:

```
Validating plugin manifest: .claude-plugin/plugin.json

  ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
  ❯ types ./types/index.d.ts declares state: sharpprompt.pending, sharpprompt.isOff, sharpprompt.mode, sharpprompt.lastDecision

Validating hooks: hooks/hooks.json

  ❯ ./register.tsx hooks: session.start, command.run{command=sharpprompt}, command.run{command=sharp}, prompt.submit, tool.call, turn.complete, ui.render{component=AbovePrompt}
  ❯ ./register.tsx answers its own command: command.run{command=sharpprompt}
  ❯ ./register.tsx answers its own command: command.run{command=sharp}
  ❯ ./register.tsx gating hook with .catch: prompt.submit
  ❯ ./register.tsx gating hook with .catch: tool.call
  ❯ ./register.tsx calls: $.clock.now (via decide, rewrite), $.clock.sleep (via race), $.command.register, $.model.classify (via classify), $.model.complete (via rewrite), $.model.fork (via rewrite), $.prompt.fill (via deliver, restoreOriginal), $.session.messages (via lastReply, recent), $.session.model (via rewrite), $.session.surface (via deliver), $.state.get, $.state.set, $.store.get (via bump, exemplarsOf, push, readList, runCommand), $.store.set (via bump, deliver, push, settlePending), $.ui.resolve
  ❯ ./register.tsx state writes: sharpprompt.isOff, sharpprompt.lastDecision, sharpprompt.mode, sharpprompt.pending
  ❯ ./register.tsx state reads: sharpprompt.isOff, sharpprompt.lastDecision, sharpprompt.mode, sharpprompt.pending

✔ Validation passed
```

That is the whole list: the model, the prompt box, the session's messages and model, its own state and store, the clock, its two commands and the band above the box. A prompt rewriter sees everything you type, so you should be able to check that it cannot send it anywhere.

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
- Claude Code's fork has no time limit, so sharpprompt stops waiting after 5 seconds and sends your prompt as typed. The fork still finishes in the background and is billed, with no cap on its output. `/sharp stats` counts these.
- VS Code and headless runs (`claude -p`, the SDK) have no box to fill, so `fill` acts as `context` there. Mods do not run in a Desktop session that uses WSL.
- Taking your own text back is two keys: `r` puts it in the box, Enter sends it. sharpprompt does not send it for you because a prompt a plugin sends shows under the plugin's name in the transcript and skips `@file` expansion. The band's buttons answer to their keys once the band has focus: ctrl+x tab, or a click.
- A rough prompt waits for the classifier and the rewrite before anything happens. In the sessions measured so far the box filled 3.6 to 6.2 seconds after Enter.

## Measurements

Two real sessions so far, 19 typed prompts. Six timed rewrites: fork median 3.1 seconds (1.7 to 4.4), classifier median about 1 second. Too few to claim anything about whether rewriting helps.

`/sharp stats` keeps, on your machine only: how many prompts each check let through, clear or rough, what happened to each rewrite, what you did with it (sent, edited, took yours back), classifier and rewrite times at p50 and p95, tokens per rough prompt, and for each turn the tool calls, duration, output tokens and whether Claude had to ask you something back. It compares turns that started from your own text with turns that started from a rewrite, and says the numbers are not evidence until there are 30 turns. A script that runs the same prompts both ways is planned; until then there is no claim here that rewriting helps.

## Related

- [severity1/claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver): a settings hook that asks you clarifying questions when a prompt is vague; it does not rewrite. About 1,900 stars, the most used tool in this space as of October 2026.
- prompt-polish (mako-code): rewrites with a small model when you ask for it, and puts the result in the box.
- clarifier (same repository): classifies prompts with Haiku and tells Claude to ask first when one is ambiguous.
- prompt-boost: rewrites with the conversation in view and per-model profiles; German interface.

## Development

Types come from the Claude Code build you run. Load the plugin once (`claude --plugin-dir .`, or `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p --plugin-dir . "/x"`) and the engine writes them to `.claude-plugin/types/` (git-ignored); `tsconfig.json` extends the one written there. After a Claude Code update, load it again.

Rules and shapes live in `docs/`; `node scripts/build-bank.mjs` compiles them into `hooks/bank.ts`, because a mod cannot read files at run time. `--check` fails when the two drift.

Checks: `claude plugin validate --strict .`, `claude plugin test .`, `tsc -p .`, `node scripts/build-bank.mjs --check`.
