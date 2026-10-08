# Claude Fable 5 and 5.1

## fable-brief-is-enough
Prefer one short instruction over a list of cases. Fable follows brief instructions well and over-prescriptive prompts can make its output worse.
Source: [Prompting Claude Fable 5, Strong instruction following](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#strong-instruction-following) and [Recommended scaffolding changes](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#recommended-scaffolding-changes)

## fable-ask-for-updates
If the task is long and the user wants to follow along, ask for a line before starting and a short recap at the end. Fable 5.1 writes few updates between tool calls unless asked. Do not ask it to keep updates brief.
Source: [Prompting Claude Fable 5.1, Ask for user-facing progress updates](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#ask-for-user-facing-progress-updates)

## fable-ambiguity
Where the request can be read two ways and the conversation does not settle it, ask Claude to take the most direct reading and state that assumption, rather than build for both.
Source: [Prompting Claude Fable 5.1, Keep changes and tests to what the task asks for](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-changes-and-tests-to-what-the-task-asks-for)

## fable-bug-phrasing
Turn "does this compile?" into "are there any bugs in this?". The compile-check phrasing trips safety classifiers more often.
Source: [Prompting Claude Fable 5.1, Reduce safeguard false positives](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#reduce-safeguard-false-positives)
