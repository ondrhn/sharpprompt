# Benchmark, Sonnet 5.5: no measurable difference

On Sonnet 5.5 with this 30-case corpus, no metric showed a difference; all intervals include zero.

Run on 9 October 2026 with Claude Code 2.1.295, model `claude-sonnet-5-5`, one repeat. Raw data: [runs/2026-10-09-claude-sonnet-5-5.jsonl](../bench/runs/2026-10-09-claude-sonnet-5-5.jsonl), its manifest and the judge's verdicts. The rewrites for this run were made for the Sonnet rule family ([rewrites/sonnet](../bench/rewrites/sonnet)); none came back KEEP, so all 30 cases are paired.

## Paired result

Difference is rewritten minus raw, per case; the interval is a bootstrap of the median difference, 1,000 resamples, fixed seed.

| metric | raw median | rewritten median | median paired difference | 95% interval |
|---|---|---|---|---|
| turns | 4 | 4 | 0 | 0 to 0 |
| tool calls | 3 | 3 | 0 | 0 to 0 |
| output tokens | 987 | 864 | -86.5 | -249 to +56 |
| seconds | 11.1 | 10.7 | -0.3 | -2.3 to +0.8 |

The turn and tool intervals are 0 to 0 because most pairs differ by nothing at the median; that is not a measured improvement, it is the absence of one.

- Final message ended on a question: raw 6 of 30, rewritten 2 of 30. In pairs: 5 cases asked only in the raw arm, 1 only in the rewritten arm, 1 in both; sign test p = 0.22. Reading the messages, 7 of the 8 questions are offers to go on ("Do you want me to make that change?", "Want me to delete it and update the tests?") after a request that said not to change anything; one is a real request for input, in both arms of inv-total-1000x ("Can you point me to last week's input file?").
- Question words in the last lines: raw 11, rewritten 7.
- Checks: raw 14 of 14, rewritten 13 of 14. The one failure is fix-budget-limit: the rewritten arm made `alerts()` fire at the limit and left `over_budget()` strict, which is what the user asked for ("the alert should fire"); the check also requires `over_budget(100, 100)` to be true. We count it as a failure because the check says so, and note that the check is stricter than the request.

## Blind judge

Sonnet 5.5 as judge, for each case: the user's request with its context, the case's `expect` sentence, and the two final answers in a random order with the arms hidden. It sees the final messages only, not the files changed.

- Pairwise: rewritten 16, raw 13, tie 1; sign test p = 0.71.
- Score from 1 to 5 for each answer on its own: raw mean 3.83, rewritten mean 3.87, mean paired difference +0.03 (n=30).
- The judge's two answers agree with each other in direction in 9 cases, disagree in 5, and are neutral (equal scores or a tie) in 16.

Three verdicts first failed because the `claude` binary was briefly missing while it updated itself; they were run again. All 60 benchmark runs were on 2.1.295.

## By task shape (n small, direction only)

| shape | n | median turn difference |
|---|---|---|
| fix | 6 | 0 |
| investigate | 5 | 0 |
| build | 5 | 0 |
| refactor | 3 | 0 |
| research | 2 | 0 |
| review | 3 | -1 |
| write | 3 | 0 |
| ask | 3 | 0 |

## Every case

turns, tool calls, output tokens, seconds, ended on a question, and check, as raw / rewritten.

| case | turns | tools | output tokens | seconds | question | check |
|---|---|---|---|---|---|---|
| fix-empty-month | 4 / 4 | 3 / 3 | 632 / 549 | 8 / 7 | - / - | pass / pass |
| fix-euro-amounts | 4 / 5 | 3 / 4 | 1,386 / 1,858 | 15 / 17 | - / - | pass / pass |
| fix-csv-commas | 4 / 4 | 3 / 3 | 606 / 604 | 7 / 8 | - / - | pass / pass |
| fix-leap-feb | 8 / 4 | 7 / 3 | 1,106 / 706 | 11 / 8 | - / - | pass / pass |
| fix-budget-limit | 6 / 5 | 5 / 4 | 759 / 886 | 10 / 12 | - / - | pass / fail |
| fix-category-case | 8 / 10 | 7 / 9 | 1,264 / 1,977 | 16 / 21 | - / - | pass / pass |
| inv-total-1000x | 12 / 6 | 11 / 5 | 2,371 / 1,595 | 23 / 19 | yes / yes | - / - |
| inv-csv-excel | 3 / 8 | 2 / 7 | 814 / 2,361 | 10 / 22 | yes / - | - / - |
| inv-groceries | 5 / 5 | 4 / 4 | 1,338 / 1,127 | 14 / 14 | - / - | - / - |
| inv-leap | 3 / 4 | 2 / 3 | 604 / 722 | 8 / 8 | - / yes | - / - |
| inv-slow | 4 / 4 | 3 / 3 | 1,084 / 1,632 | 13 / 18 | - / - | - / - |
| build-category-totals | 3 / 5 | 2 / 4 | 704 / 1,078 | 9 / 14 | yes / - | pass / pass |
| build-month-flag | 5 / 7 | 4 / 6 | 1,440 / 1,350 | 14 / 14 | - / - | pass / pass |
| build-csv-total | 9 / 9 | 8 / 8 | 2,821 / 1,852 | 26 / 19 | - / - | pass / pass |
| build-negative | 13 / 6 | 12 / 5 | 1,716 / 871 | 17 / 11 | - / - | pass / pass |
| build-biggest | 11 / 3 | 10 / 2 | 3,071 / 1,141 | 26 / 12 | - / - | pass / pass |
| ref-split-parsing | 4 / 4 | 3 / 3 | 1,063 / 694 | 13 / 9 | - / - | pass / pass |
| ref-dates | 6 / 4 | 5 / 3 | 1,476 / 714 | 16 / 10 | - / - | pass / pass |
| ref-names | 3 / 4 | 2 / 3 | 597 / 856 | 8 / 10 | - / - | pass / pass |
| res-decimal | 1 / 1 | 0 / 0 | 324 / 286 | 5 / 4 | - / - | - / - |
| res-csv-excel | 1 / 1 | 0 / 0 | 1,439 / 826 | 11 / 7 | - / - | - / - |
| rev-calc | 3 / 8 | 2 / 7 | 911 / 1,968 | 11 / 19 | yes / - | - / - |
| rev-export | 6 / 2 | 5 / 1 | 1,293 / 1,098 | 14 / 11 | - / - | - / - |
| rev-my-budget | 5 / 4 | 4 / 3 | 647 / 755 | 9 / 9 | - / - | - / - |
| write-euro-note | 1 / 1 | 0 / 0 | 263 / 267 | 4 / 3 | - / - | - / - |
| write-readme-tests | 7 / 7 | 6 / 6 | 1,276 / 1,010 | 13 / 14 | - / - | - / - |
| write-commit-msg | 1 / 1 | 0 / 0 | 155 / 62 | 3 / 2 | - / - | - / - |
| ask-floats | 3 / 3 | 2 / 2 | 690 / 426 | 9 / 6 | yes / - | - / - |
| ask-month-key | 3 / 3 | 2 / 2 | 472 / 399 | 7 / 6 | - / - | - / - |
| ask-dates-needed | 6 / 2 | 5 / 1 | 844 / 609 | 10 / 7 | yes / - | - / - |

## Method and cost

Same as the [Fable 5.1 run](bench-2026-10-09-fable-5-1.md#method): two arms per case on a fresh fixture copy, random arm order, context as its own earlier turn, only the last turn measured. Cost as the API would bill it (Max plan): 5.40 USD for the measured turns and 0.91 USD for the context turns, 6.31 USD in all; 922 seconds. The judge's calls are not included.

## Limits

- We wrote the corpus; all 30 cases are in the repository.
- One repeat. The Fable run's same-prompt pairs moved by up to 5 turns and 14 seconds; differences below that cannot show.
- The rewrites come from the plugin's fallback template with the context pasted in, not from a fork of a live conversation, and no classifier picked which prompts to rewrite.
- The judge reads final messages only, and it disagreed with itself in a sixth of the cases.
- Both arms loaded the account's `~/.claude/CLAUDE.md`.
