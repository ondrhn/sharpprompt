# promptgate

Work in progress. The full README comes with the first usable version.

## Development

Types come from the Claude Code build you run, not from a copy in this repo. Loading the plugin once (`claude --plugin-dir .`, or `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p --plugin-dir . "/x"`) makes the engine write them to `.claude-plugin/types/` (git-ignored); the first line of `claude-code/index.d.ts` names the version.
`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, so `tsc -p .` checks hooks, types and tests against that build. After a Claude Code update, load it again and the files are rewritten.
Checks: `claude plugin validate --strict .`, `claude plugin test .`, `tsc -p .`.
