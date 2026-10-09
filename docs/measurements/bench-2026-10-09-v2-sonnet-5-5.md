# Benchmark v2, Sonnet 5.5: rewrites help when the model lacks the information

On the v2 corpus, where each case hides something the model cannot get from the code, the rewritten arm passed 25 of 30 checks and the prompt as typed passed 13 (p = 0.0005). All of the gain is in two of the three case families. On session state both arms passed everything.

Run on 9 October 2026 with Claude Code 2.1.295, model `claude-sonnet-5-5`, one repeat. Raw data: [runs/2026-10-09-v2-claude-sonnet-5-5.jsonl](../bench/runs/2026-10-09-v2-claude-sonnet-5-5.jsonl), its manifest and the judge's verdicts. Rewrites: [rewrites/sonnet-v2](../bench/rewrites/sonnet-v2), helper Haiku, oracle Sonnet 5.5; none came back KEEP, so all 30 cases are paired.

This is a narrower claim than "rewriting makes Claude better". The v1 corpus, where the prompt as typed already carried what the model needed, showed no difference on Sonnet 5.5 ([report](bench-2026-10-09-sonnet-5-5.md)) or Fable 5.1 ([report](bench-2026-10-09-fable-5-1.md)).

## The corpus

Three families of ten, in [cases-v2.jsonl](../bench/cases-v2.jsonl), on a small expenses project ([fixture-v2](../bench/fixture-v2)). Each case has a check in [checks-v2](../bench/checks-v2).

- hidden-spec: the request leaves out one constraint the user had in mind ("make the csv export work with finance's import tool"; finance wants semicolons). The check tests that constraint.
- remote-ref: a long earlier conversation names two similar bugs, and the request points back to one of them vaguely ("fix the quoting in that csv function u mentioned"). The check wants the target changed and the other function, the decoy, left exactly as it was.
- session-state: the session last ran a failing test, and the request says "fix it". The check wants that test passing and every other module unchanged.

## By family

| family | n | checks raw | checks rewritten | rewriter asked | judge rewritten / raw / tie |
|---|---|---|---|---|---|
| hidden-spec | 10 | 1 | 5 | 10 | 9 / 1 / 0 |
| remote-ref | 10 | 2 | 10 | 6 | 9 / 1 / 0 |
| session-state | 10 | 10 | 10 | 1 | 8 / 2 / 0 |
| all | 30 | 13 | 25 | 17 | 26 / 4 / 0 |

"Rewriter asked" counts the cases where the rewrite step put a question to the user (here, the oracle) before sending. Checks in pairs: 12 cases passed only in the rewritten arm, none only in the raw arm; sign test p = 0.0005.

## Remote reference: raw changed both

In all 8 remote-ref cases the raw arm failed, it changed the target correctly and the decoy as well. It never picked the wrong function alone. Its answers say so: "I fixed both `category_csv` and `report_csv` in `export.py`, since they had the same bug and you didn't say which one you meant." So the check counts as a failure something a user might be glad to get. We keep it a failure because the case says to leave the decoy alone, and because a change the user did not ask for is the thing this family measures. The rewritten arm changed the target only in all 10.

## Hidden spec: what raw guessed, what it asked

The raw arm either guessed or stopped. It stopped without changing anything in 3 cases (csv separator, date format, column order) and asked what finance's tool expects; the check fails on those because nothing changed. In the other 7 it made a reasonable guess and said it was one:

- spec-near-75: moved the warning to 90% ("fire when spending reaches 90%"); the user meant 75%.
- spec-round-005: rounded to 2 decimals; the user meant rounding to 0.05.
- spec-eur-suffix: added a currency argument with USD as default ("I picked USD as the default without knowing which currency you use"); the user meant EUR.
- spec-hide-small: hid categories under 5.00; the user meant under 10.00.
- spec-top3-other: kept the top 5 and rolled the rest into Other; the user meant top 3.
- spec-refunds: parsed several negative formats, but `report()` has no `refunds` field, which the check wants.
- spec-sort-amount: sorted by amount, largest first, which was right.

None of these is careless. The information was not there.

## Where the rewrite lost

The rewritten arm failed 5 hidden-spec cases. In 4 the rewrite step asked a question, but not the one that mattered:

- spec-csv-separator asked "What goes wrong when finance imports the current export?"; the oracle said the import rejects the file. Nothing about the separator, and the model stopped and asked again.
- spec-top3-other asked which categories to keep ("Top few by total"); not how many, and nothing about an Other line. The model kept 5.
- spec-eur-suffix asked which commands should show the currency, not which currency. The model picked USD.
- spec-hide-small asked how to cut off ("Fixed euro amount"), and that option's text carried a threshold the helper made up: "Hide categories whose total is below 5 EUR." The user meant 10.00.

The fifth is spec-near-75, below.

## near-75

The rewrite asked how early the warning should fire, and the oracle answered "At 75% used". The model changed `near_budget` from 90% to 75% and kept the strict comparison (`spent > 0.75 * limit`), so 75 of 100 does not warn and the check fails. It said so: "The warning fires when spending goes above 75%, not at exactly 75%. ... If you want it to fire at exactly 75%, change `>` to `>=`." The rewrite carried the number, and the boundary got lost between "at 75% used" and the old comment's "reaches". The raw arm went to 90%. Neither arm made `alerts()` call `near_budget`, and the check does not ask for it.

## Blind judge

Sonnet 5.5 as judge, with the user's request, the context, the case's `expect` sentence and the two final answers in a random order, arms hidden. It sees the final messages only, not the files.

- Pairwise: rewritten 26, raw 4, tie 0; sign test p < 0.001.
- Score from 1 to 5 for each answer on its own: raw mean 3.03, rewritten mean 4.03, mean paired difference +1.00 (n=30).
- The judge's two answers agree in direction in 16 cases, disagree in 3, and are neutral in 11.

The judge prefers the rewritten arm on session-state too (8 to 2), where both arms pass every check. We read that as style, not task success.

## Turns, tokens, time

Rewritten minus raw, per case; bootstrap of the median, 1,000 resamples, fixed seed.

| metric | raw median | rewritten median | median paired difference | 95% interval |
|---|---|---|---|---|
| turns | 4 | 4 | 0 | -0.5 to 0 |
| tool calls | 3 | 3 | 0 | -0.5 to 0 |
| output tokens | 742 | 607 | -51.5 | -286 to +39 |
| seconds | 9.2 | 9.4 | -0.6 | -2.5 to +0.5 |

All four intervals include zero. Final message ended on a question: raw 2, rewritten 1.

## Every case

raw / rewritten. "Rewriter asked" is the number of questions the rewrite step asked.

| case | family | rewriter asked | turns | output tokens | seconds | check | judge |
|---|---|---|---|---|---|---|---|
| spec-csv-separator | hidden-spec | 1 | 3 / 3 | 769 / 833 | 10 / 10 | fail / fail | raw |
| spec-near-75 | hidden-spec | 2 | 9 / 4 | 1,529 / 545 | 20 / 11 | fail / fail | rewritten |
| spec-date-format | hidden-spec | 1 | 3 / 9 | 718 / 1,445 | 11 / 17 | fail / pass | rewritten |
| spec-refunds | hidden-spec | 1 | 5 / 3 | 1,888 / 1,213 | 17 / 13 | fail / pass | rewritten |
| spec-sort-amount | hidden-spec | 1 | 4 / 6 | 526 / 710 | 8 / 10 | pass / pass | rewritten |
| spec-top3-other | hidden-spec | 1 | 10 / 7 | 2,560 / 1,898 | 22 / 18 | fail / fail | rewritten |
| spec-round-005 | hidden-spec | 1 | 5 / 5 | 912 / 1,692 | 11 / 19 | fail / pass | rewritten |
| spec-eur-suffix | hidden-spec | 1 | 12 / 6 | 2,145 / 1,548 | 46 / 18 | fail / fail | rewritten |
| spec-hide-small | hidden-spec | 1 | 4 / 6 | 855 / 895 | 11 / 14 | fail / fail | rewritten |
| spec-column-order | hidden-spec | 1 | 3 / 4 | 501 / 747 | 8 / 11 | fail / pass | rewritten |
| ref-quote-report-csv | remote-ref | - | 4 / 5 | 873 / 822 | 9 / 9 | fail / pass | rewritten |
| ref-quote-category-csv | remote-ref | - | 4 / 5 | 720 / 797 | 8 / 11 | fail / pass | rewritten |
| ref-short-dates-month-key | remote-ref | - | 4 / 4 | 1,004 / 606 | 10 / 7 | fail / pass | rewritten |
| ref-short-dates-week-key | remote-ref | 1 | 4 / 4 | 1,147 / 592 | 11 / 8 | fail / pass | rewritten |
| ref-boundary-over-budget | remote-ref | 1 | 4 / 4 | 722 / 439 | 8 / 7 | pass / pass | raw |
| ref-boundary-near-budget | remote-ref | 1 | 6 / 4 | 1,063 / 419 | 13 / 7 | fail / pass | rewritten |
| ref-empty-average | remote-ref | - | 5 / 4 | 755 / 465 | 9 / 6 | fail / pass | rewritten |
| ref-empty-median | remote-ref | 1 | 5 / 4 | 842 / 448 | 10 / 7 | fail / pass | rewritten |
| ref-thousands-print-report | remote-ref | 1 | 4 / 4 | 729 / 607 | 9 / 7 | pass / pass | rewritten |
| ref-thousands-alerts | remote-ref | 1 | 7 / 4 | 1,028 / 479 | 11 / 7 | fail / pass | rewritten |
| session-average | session-state | - | 4 / 5 | 385 / 512 | 9 / 8 | pass / pass | rewritten |
| session-euro | session-state | 1 | 4 / 3 | 998 / 884 | 9 / 9 | pass / pass | rewritten |
| session-csv | session-state | - | 3 / 3 | 513 / 551 | 7 / 7 | pass / pass | raw |
| session-leap | session-state | - | 4 / 5 | 526 / 543 | 7 / 7 | pass / pass | rewritten |
| session-limit | session-state | - | 4 / 4 | 635 / 830 | 9 / 11 | pass / pass | rewritten |
| session-case | session-state | - | 5 / 5 | 630 / 613 | 9 / 10 | pass / pass | rewritten |
| session-median | session-state | - | 4 / 4 | 408 / 487 | 7 / 7 | pass / pass | rewritten |
| session-week | session-state | - | 3 / 4 | 561 / 579 | 8 / 11 | pass / pass | rewritten |
| session-category-csv | session-state | - | 3 / 3 | 596 / 505 | 9 / 7 | pass / pass | raw |
| session-near | session-state | - | 4 / 3 | 483 / 431 | 8 / 7 | pass / pass | rewritten |

## Method

Same runner as v1: two arms per case on a fresh copy of the fixture, random arm order, the context as its own earlier turn, only the last turn measured. What is new in v2:

- The rewrite step may ask the user questions, as the plugin does in a live session. Here an oracle model answers them. It gets the case's hidden spec and the question, and is told to answer only what was asked.
- The rewrite gets the session facts (last test run, files touched) the plugin reads from the transcript.

The oracle is Sonnet 5.5. A first pass with Haiku as oracle leaked: asked "which budget?", it volunteered the 75% threshold; asked which output should show the currency, it added the " EUR" suffix. Those answers handed the rewritten arm what the user had not been asked, so we threw that pass away and regenerated every rewrite with Sonnet. Sonnet still leaks a little (on Fable's near-75 rewrite it named `near_budget` and 75% in reply to "which budget?"), so a gain on hidden-spec is partly a measure of how well the oracle keeps quiet.

Cost as the API would bill it (Max plan): 5.95 USD for the measured turns and 1.65 USD for the context turns, 7.60 USD in all; 910 seconds. The rewrites, the oracle and the judge are not included.

## Limits

- We wrote the corpus, and we wrote it to have something missing. The result says rewriting helps when the model lacks information the user can supply; it says nothing about how often real prompts are like that.
- One repeat.
- The oracle is a model told what the user meant. A real user might answer worse (or better).
- The rewrites come from the plugin's fallback template with the context pasted in, not from a fork of a live conversation.
- The judge reads final messages only.
- Both arms loaded the account's `~/.claude/CLAUDE.md`.
