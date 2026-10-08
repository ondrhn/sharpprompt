# sharpprompt

Work in progress. The full README comes with the first usable version.

## Limits

- The rewrite itself runs on the session's own model, through a fork of the conversation, so it can resolve "the file above". The `optimizerModel` setting only picks the model for the rough-or-clear check and for the fallback rewrite in a session with no conversation yet.
- The engine's fork takes no time limit, so sharpprompt stops waiting after 5 seconds and sends your prompt as typed. The fork still finishes in the background and is billed; its output has no cap. `/sharp stats` counts these.

## Development

Types come from the Claude Code build you run, not from a copy in this repo. Loading the plugin once (`claude --plugin-dir .`, or `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p --plugin-dir . "/x"`) makes the engine write them to `.claude-plugin/types/` (git-ignored); the first line of `claude-code/index.d.ts` names the version.
`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, so `tsc -p .` checks hooks, types and tests against that build. After a Claude Code update, load it again and the files are rewritten.
Checks: `claude plugin validate --strict .`, `claude plugin test .`, `tsc -p .`.
