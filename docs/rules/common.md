# Rules for every model

## keep-intent
Keep what the user asked for. Do not add tasks, change the goal, or answer the prompt yourself. Resolve references to the conversation ("the second item above", "that file", "same as before") into the concrete names they point to, and invent nothing the conversation does not show: no file names, numbers, deadlines or requirements. Keep the user's own uncertainty ("I guess", "maybe") where they wrote it, and never add guesses of your own.
Source: [Prompting best practices, Be clear and direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)

## give-the-reason
When the conversation or the prompt shows why the user wants this or who it is for, say it in one plain sentence. If the reason is not knowable, leave it out rather than guess.
Source: [Prompting best practices, Add context to improve performance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#add-context-to-improve-performance) and [Prompting Claude Fable 5, Give the reason, not only the request](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#give-the-reason-not-only-the-request)

## name-the-deliverable
Make the output explicit: what should exist or be answered when Claude is done, and how the user will tell it is done (tests pass, a file exists, a question answered). Use a check that already exists (the tests, a command) as the done signal; do not add work the user did not ask for, such as new tests. Use a short numbered list only when the order of steps matters.
Source: [Prompting best practices, Be clear and direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)

## question-stays-a-question
If the user is asking a question, describing a problem or thinking out loud, the rewrite asks for an assessment and says not to change anything yet. Never turn a question into an order to fix.
Source: [Prompting Claude Fable 5, State the boundaries](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#state-the-boundaries)

## state-what-is-out
When the prompt or conversation makes clear what must not be touched, say it in one sentence (files, behaviour, scope). Do not invent restrictions.
Source: [Prompting Claude Fable 5.1, Keep changes and tests to what the task asks for](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-changes-and-tests-to-what-the-task-asks-for)

## ideas-mean-ideas
If the user asks for ideas, options or a plan, the rewrite asks for that and says to wait before building anything.
Source: [Prompting Claude Sonnet 5.5, Steer initiative and scope](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5#steer-initiative-and-scope)

## no-reasoning-echo
Never ask Claude to show, write out or explain its thinking or reasoning, and never add "think step by step". Recent models may refuse such requests (the reasoning_extraction category). Asking for a short explanation of the answer is fine.
Source: [Prompting Claude Fable 5, Recommended scaffolding changes](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#recommended-scaffolding-changes) and [Prompting Claude Opus 5.5, Safeguard refusals](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5#safeguard-refusals)

## calm-language
No capital-letter emphasis, no "CRITICAL" or "MUST", no threats or bribes, no urgency. Current models follow plain instructions and over-apply shouted ones.
Source: [Prompting best practices, Tool usage](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage)

## no-role-filler
Do not open with a role ("You are an expert ..."). The prompt is a user turn inside Claude Code, which already has its system prompt; a role line there only adds length.
Source: sharpprompt. Anthropic's role guidance ([Give Claude a role](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role)) is about system prompts; inside Claude Code the system prompt already exists, so a role line in the user's message adds nothing.

## stay-short
The rewrite is at most twice the length of the original or 60 words, whichever is more, and never more than 180 words. Write it in the user's language and voice (or in English when the rewriteLanguage setting says en), first person, as if they had typed it carefully. No headings, no XML tags, no preamble.
Source: sharpprompt. Long rewrites are slower to read than to fix; [Prompting Claude Fable 5, Strong instruction following](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#strong-instruction-following) notes a brief instruction steers as well as a list.
