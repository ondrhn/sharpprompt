# Benchmark v2, hidden spec with Sonnet 5.5 writing the questions

The rewrite lost half of the hidden-spec cases in both v2 runs, and in most of them it asked a question, just not the one the case turned on. Those rewrites and questions came from Haiku. Here Sonnet 5.5 wrote them instead, everything else held the same, to see whether the weak questions come from the model or from the instruction.

They come from the instruction. With the cases the oracle leaked on left out, Sonnet as helper passed 3 checks where Haiku passed 4, on both models. Over all ten cases it is 6 against 5 on Sonnet 5.5 and 5 against 5 on Fable 5.1. Sonnet asks about the same things Haiku does (the source of the format, the method), not the value the user had in mind, and for the Fable rule family it asks less often.

Run on 9 October 2026, Claude Code 2.1.295, one repeat, the 10 hidden-spec cases of [cases-v2.jsonl](../bench/cases-v2.jsonl), rewritten arm only. Rewrites: [rewrites/sonnet-v2-sonnet-helper](../bench/rewrites/sonnet-v2-sonnet-helper) and [rewrites/fable-v2-sonnet-helper](../bench/rewrites/fable-v2-sonnet-helper), helper `claude-sonnet-5-5`, oracle `claude-sonnet-5-5`. Runs: [Sonnet 5.5](../bench/runs/2026-10-09-v2-sonnet-helper-claude-sonnet-5-5.jsonl), [Fable 5.1](../bench/runs/2026-10-09-v2-sonnet-helper-claude-fable-5-1.jsonl). The raw arm and the Haiku-helper arm are the runs of the [Sonnet](bench-2026-10-09-v2-sonnet-5-5.md) and [Fable](bench-2026-10-09-v2-fable-5-1.md) v2 reports, not run again.

## Result

Checks passed, rewritten arm, hidden-spec cases.

| model | helper | all 10 | without leaked cases |
|---|---|---|---|
| Sonnet 5.5 | Haiku | 5 | 4 of 6 |
| Sonnet 5.5 | Sonnet 5.5 | 6 | 3 of 6 |
| Fable 5.1 | Haiku | 5 | 4 of 8 |
| Fable 5.1 | Sonnet 5.5 | 5 | 3 of 8 |

"Without leaked cases" leaves out, for each model, every case where the oracle leaked under either helper: 4 cases on Sonnet (refunds, csv-separator, hide-small, near-75), 2 on Fable (near-75, column-order). The raw arm passed 1 of 10 on both models.

The sample is 10 cases with one repeat, so a difference of one case means nothing. What the table does show is that a stronger helper did not close the gap.

## Case by case

Questions asked by the rewrite step, and the check, per helper. "Leak" names the helper whose oracle answer gave away what the question did not ask, or answered wrongly.

Sonnet 5.5:

| case | Haiku: questions | Haiku: check | Sonnet: questions | Sonnet: check | leak |
|---|---|---|---|---|---|
| spec-csv-separator | 1 | fail | 1 | pass | Sonnet |
| spec-near-75 | 2 | fail | 1 | fail | Sonnet (wrong answer) |
| spec-date-format | 1 | pass | 1 | pass | - |
| spec-refunds | 1 | pass | 1 | pass | Haiku |
| spec-sort-amount | 1 | pass | 1 | pass | - |
| spec-top3-other | 1 | fail | 1 | fail | - |
| spec-round-005 | 1 | pass | 0 | fail | - |
| spec-eur-suffix | 1 | fail | 1 | fail | - |
| spec-hide-small | 1 | fail | 1 | pass | Sonnet |
| spec-column-order | 1 | pass | 1 | pass | - |

Fable 5.1:

| case | Haiku: questions | Haiku: check | Sonnet: questions | Sonnet: check | leak |
|---|---|---|---|---|---|
| spec-csv-separator | 2 | fail | 0 | fail | - |
| spec-near-75 | 2 | pass | 1 | pass | Haiku |
| spec-date-format | 1 | pass | 0 | fail | - |
| spec-refunds | 1 | fail | 0 | fail | - |
| spec-sort-amount | 1 | pass | 0 | pass | - |
| spec-top3-other | 1 | fail | 0 | fail | - |
| spec-round-005 | 1 | pass | 1 | pass | - |
| spec-eur-suffix | 2 | fail | 1 | fail | - |
| spec-hide-small | 1 | pass | 0 | pass | - |
| spec-column-order | 0 | fail | 1 | pass | Sonnet |

Cases with at least one question: Sonnet family, Haiku 10 and Sonnet 9; Fable family, Haiku 9 and Sonnet 4. Sonnet as helper asked less, not more.

## Did it ask for the value?

What each case needs is one value: the separator, the currency, how many categories and an Other line, where refunds go, the column order. Sonnet as helper asked for it in date-format ("How does finance write dates?"), sort-amount, refunds and column-order on the Sonnet family, in near-75 on both, and in round-005 on Fable (on the Sonnet family it asked nothing there and wrote "two decimal places" into the prompt itself). Elsewhere it asked about something next to it:

- spec-csv-separator (Sonnet family): "How do you know what the finance import tool needs?" with options "Spec file in repo / Import errors / Sample file". The oracle answered with the separator anyway, which is a leak; the pass comes from that.
- spec-eur-suffix (both): "Which currency should the CLI output show?" with options "Existing currency field / Symbol only / ISO code", and on Fable "How should the currency be shown?". No option names a currency; the oracle took "ISO code" and the model picked USD. Same failure as with Haiku.
- spec-top3-other (Sonnet family): "How should the email decide which categories to keep?", answered "Top by size". Not how many, not the Other line.
- spec-hide-small (Sonnet family): asked how to decide what is tiny; the oracle added the threshold, 10.00 (leak).

For the Fable family Sonnet mostly did not ask, and wrote the gap into the prompt as an instruction to decide: "pick the most sensible one ... tell me which you chose" (sort-amount), "Use your judgment on which to keep" (top3-other), "If you can't tell which format that is from the code, ask me" (date-format). The Fable rules ask the rewrite to leave choices to the model, and Sonnet followed them more closely than Haiku did.

## near-75

On Fable it passed with either helper. With Sonnet as helper the question was "How much earlier should the budget warnings fire?", the options "You pick a value / Warn at 80% / Warn at 50% / Make it configurable", and the oracle answered "Warn from 75% of the limit"; the model used `>=`. That answer gives the value the question asked for, so it is not a leak (the Haiku-helper pass on Fable was one).

On Sonnet the same question with nearly the same options got "Warn at 80%" from the oracle, a wrong answer: the user meant 75%. The model then set 80% and the check failed. The oracle is told to pick a label when one states the answer; here none did, and it picked the nearest. We count the case as tainted.

## Oracle leaks

The oracle prompt now says never to name a function, file, number, threshold or value the question did not ask about. The Sonnet-helper rewrites were made with that rule, the Haiku ones before it, so the two helpers did not face quite the same oracle. The rule did not stop it: two of the three Sonnet-family leaks came after it.

The audit (`bench.mjs audit`) flags oracle answers that name something from the hidden spec that the question, its option labels and the user's own prompt and context do not mention. Its first version looked only for numbers, quoted text and code names. It missed the csv-separator leak because "semicolon-separated files" is plain words, and it cannot see a wrong answer that matches a label (near-75 above). It now also matches plain words of the hidden spec. A flag is a candidate: an answer that gives the asked-for value when no option had it (DD.MM.YYYY, 0.05, "by amount, largest first") is flagged too, so every flag was read by hand.

| rewrite set | flagged | leaks read by hand |
|---|---|---|
| sonnet-v2 (Haiku) | 5 | spec-refunds (named the `report()['refunds']` field and the net total; asked only what to do with negative rows) |
| fable-v2 (Haiku) | 5 | spec-near-75 (named `near_budget` and 75% when asked which budget) |
| sonnet-v2-sonnet-helper | 6 | spec-csv-separator, spec-hide-small; plus spec-near-75, wrong answer, not flagged |
| fable-v2-sonnet-helper | 3 | spec-column-order (asked where the order comes from, gave the order) |

## Blind judge

Sonnet 5.5 as judge, as in the v2 reports; the raw arm's answers are the same as there and were judged again against the new rewritten answers.

- Sonnet 5.5: rewritten 7, raw 3, tie 0, p = 0.34; scores raw 2.40, rewritten 3.30.
- Fable 5.1: rewritten 4, raw 5, tie 1, p = 1.0; scores raw 2.20, rewritten 3.10.

On Fable the pairwise pick and the single scores point different ways; with ten cases we do not read anything into it.

## Cost

Measured and context turns, as the API would bill them (Max plan): 1.25 USD on Sonnet 5.5 and 7.84 USD on Fable 5.1, 9.09 USD in all. The rewrites, the oracle and the judge are not included.

## Limits

- 10 cases, one repeat, rewritten arm only.
- The Haiku and Sonnet helper sets were made with slightly different oracle prompts (the no-naming rule came in between).
- The oracle is a model. On this corpus it leaked or answered wrongly in 1 to 3 of 10 cases per set, which is about the size of the effect being measured.
- The helper here writes from the fallback template, as in the v2 runs; the plugin's usual path forks the session model with the whole conversation.
