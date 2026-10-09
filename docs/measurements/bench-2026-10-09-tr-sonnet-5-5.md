# Benchmark, Turkish drafts on Sonnet 5.5

Turkish drafts rewritten into English: same task success and judge scores; fewer output tokens and less time, mostly because the answers come back in English.

Run on 9 October 2026 with Claude Code 2.1.295, model `claude-sonnet-5-5`, one repeat. The same 30 cases as the English corpus, with the user's prompts and messages written as a Turkish speaker types them: short, lower case, often without Turkish letters, English technical words mixed in ([cases-tr.jsonl](../bench/cases-tr.jsonl)). The rewritten arm uses `rewriteLanguage: en` ([rewrites/sonnet-tr](../bench/rewrites/sonnet-tr)); with that setting the rewriter may not answer KEEP for a non-English draft, so all 30 cases are paired. Raw data: [runs/2026-10-09-tr-claude-sonnet-5-5.jsonl](../bench/runs/2026-10-09-tr-claude-sonnet-5-5.jsonl), manifest and judge verdicts beside it.

## Three arms

| | Turkish, as typed | Turkish, rewritten into English | English, as typed (earlier run) |
|---|---|---|---|
| turns, median | 5 | 4 | 4 |
| tool calls, median | 4 | 3 | 3 |
| output tokens, median | 1,144 | 848 | 987 |
| seconds, median | 14.3 | 10.1 | 11.1 |
| checks passed | 14 of 14 | 14 of 14 | 14 of 14 |
| ended on a question | 0 | 3 | 6 |

## Paired result, Turkish as typed against Turkish rewritten

Median paired difference (rewritten minus as typed), bootstrap 95% interval, 1,000 resamples, fixed seed.

| metric | difference | 95% interval |
|---|---|---|
| turns | 0 | -2 to 0 |
| tool calls | 0 | -2 to 0 |
| output tokens | -206 | -398 to -68.5 |
| seconds | -2.1 | -4.1 to -0.7 |

- Checks: 14 of 14 in both arms.
- Blind judge (Sonnet 5.5, told the user wrote in Turkish and not to prefer either language): rewritten 16, as typed 14, sign test p = 0.86; scores from 1 to 5 averaged 3.83 in both arms. In two cases it still preferred the as-typed arm because that answer was "in Turkish like the user's message".
- The three questions in the rewritten arm are offers to go on ("Do you want me to make that change?"), not requests for input.

## Why fewer tokens

The answers changed language. As typed, 29 of 30 answers came back in Turkish and 1 mixed; rewritten, 25 came back in English and 5 in Turkish. Turkish takes more tokens for the same text: the as-typed answers used a median of 148 output tokens per 100 characters, the rewritten ones 109. Against the English corpus run on the same cases, the Turkish drafts as typed used a median of 143 more output tokens per case, and the English rewrites 34 fewer, about the level of English typed directly. So the rewrite brings a Turkish draft back to what an English draft costs, and most of that comes from the English answer.

That has a price: a user who writes in Turkish gets an English answer in 25 of 30 cases. Some people want that, others do not. We did not test the simpler alternative of adding "Answer in English" to the Turkish draft, which may give the same saving.

## Limits

- We wrote both corpora; all cases are in the repository.
- One repeat; the Fable 5.1 run showed the same prompt moving by up to 5 turns and 14 seconds.
- Rewrites come from the plugin's fallback template with the context pasted in, not from a fork, and no classifier chose which prompts to rewrite.
- The language of an answer is a simple guess from Turkish letters and common words.
- One rewrite kept a Turkish word from the context in brackets: "transport (ulaşım)" in inv-total-1000x.
- Cost as the API would bill it (Max plan): 6.38 USD, 1,028 seconds; the judge is not included.
