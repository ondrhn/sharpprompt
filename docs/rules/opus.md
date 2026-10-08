# Claude Opus 5 and 5.5

## opus-no-verify-step
Do not add "verify your work" or "add a final verification step". Opus 5 verifies on its own and extra verification instructions waste tokens.
Source: [Prompting Claude Opus 5, Task scope and over-verification](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#task-scope-and-over-verification)

## opus-hold-scope
For a narrow task, say plainly to deliver what was asked at that scope and to mention, not do, anything beyond it. Opus 5 can widen a task on its own.
Source: [Prompting Claude Opus 5, Task scope and over-verification](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#task-scope-and-over-verification)

## opus-length
If the user wants a document or reply of a certain size, say so. Opus 5 writes longer replies and documents by default, and effort does not reliably shorten them.
Source: [Prompting Claude Opus 5, Response length and verbosity](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#response-length-and-verbosity) and [Written deliverable length](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#written-deliverable-length)
