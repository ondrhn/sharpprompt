# Benchmark

Does a sharpprompt rewrite make Claude's work easier than the rough prompt it came from? The benchmark runs the same cases twice, once with the prompt as typed and once with the rewrite, on the same model and a fresh copy of the same project, and compares the two runs.

## What is here

- `cases.jsonl`: 30 cases (fix 6, investigate 5, build 5, refactor 3, research 2, review 3, write 3, ask 3). Each has the last few messages before the prompt (`context`), the rough prompt (`raw`), a check script when there is one, and one sentence on what a good answer does (`expect`, for reading the results by hand). We wrote them, inspired by everyday use, so they may lean in sharpprompt's favour; all of them are here to read, and anyone can add more.
- `fixture/`: a small Python project (expense totals, five modules, eight passing tests) with six known faults: `report([])` divides by zero, `parse_amount` misreads European amounts like `1.000,50`, `report_csv` does not quote names with commas, `days_in_month` ignores leap years, `over_budget` misses spending exactly at the limit, and categories that differ by case are counted apart. Every run starts from a fresh copy.
- `checks/`: one script per fix case, kept outside the fixture so the model never sees them, plus `regression.py`, which runs the fixture's own tests. Each exits 0 when the behaviour the case asked for is there. Before any fix all six fail and the regression passes; on a correct fix all pass.
- `rewrites/<family>/`: the text the rewritten arm sends, one file per case, with `index.jsonl` saying how each was made. sharpprompt picks its rules by the session model's family, so each family the benchmark runs on has its own set (`fable/`, `sonnet/`); the runner reads the set for the model it runs. These come from the plugin's own template and reply cleaning (`completePrompt` and `clean` in `hooks/rewrite.ts`), sent to the helper model (Haiku) with the case's context pasted in. That is the plugin's fallback path for a session with no conversation yet. The usual path, a fork of the live conversation on the session's own model, does not exist in a headless run, so the benchmark cannot use it. So the rewrites and, in v2, their questions come from Haiku, while in the plugin they usually come from the session model. Where the model answered KEEP (4 of 30 for `fable/`, 0 for `sonnet/`), the rewritten arm sends the prompt as typed, as the plugin would. Nothing in these files was edited by hand.

## Differences from real use

- No classifier: every case goes to the rewrite, where in a session the classifier would let some through untouched.
- The rewrite reads the context as pasted text, not as a forked conversation.
- The runs load the account's own `~/.claude/CLAUDE.md`, which `claude -p` reads in every mode that works with a subscription. It is the same for both arms.

## Running it

```sh
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs run --model claude-fable-5-1 [--repeat 1] [--only id,id]
```

Each case runs twice on a fresh copy of the fixture under `/tmp`, in a random order recorded per case. When a case has context, it goes first as its own turn ("For context, this is what we said earlier... reply ok"), the same text for both arms, and the prompt follows with `--resume`; only that last turn is measured. Runs use `--setting-sources ''`, `--permission-mode acceptEdits` and `--allowedTools 'Bash(python3 *)'`, so the model can edit the copy and run the project's tests and nothing else. The runner removes `CLAUDE_CODE_CHILD_SESSION` and `CLAUDECODE` from the child's environment when started from inside Claude Code; with them set, transcripts are not saved and `--resume` fails.

Output: `runs/<date>-<model>.jsonl` (one line per run) and `runs/<date>-<model>.manifest.jsonl` (case, arm, order, repeat, session id). Starting the same command again skips what the manifest already holds, and a usage limit stops the run so it can be continued later.

## Reading the results

```sh
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs summary docs/bench/runs/<file>.jsonl
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs judge docs/bench/runs/<file>.jsonl --judge-model claude-sonnet-5-5
```

`summary` gives the paired medians and bootstrap intervals over the cases whose rewrite is not KEEP. `judge` hands a second model, for each such case, the user's request, the case's `expect` sentence and the two final answers in a random order with the arms hidden; it picks one or calls a tie, and scores each answer from 1 to 5 on its own. It sees only the final messages, not the files changed. The verdicts go to `<file>.judge.jsonl`, with a sign test over wins and losses.

## Making the rewrites again

```sh
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/bench.mjs rewrites [--helper haiku] [--family fable] [--only id,id]
```

`--family` is the rule family of the model the benchmark will run on. With `--cases v2`, `--ask old` makes the rewrites with the ask instruction from before 2bc8620 (kept in `bench.mjs`) instead of the one in `hooks/rewrite.ts`; `--only spec2-*` takes every id with that start.
