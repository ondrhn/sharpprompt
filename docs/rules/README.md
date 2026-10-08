# Rewrite rules

The rules the rewriter follows, one file per model family plus `common.md` for all of them. Each rule is an `##` heading (its id), one paragraph the rewriter reads word for word, and a `Source:` line. A rule with `Source: sharpprompt` is our own design choice, not Anthropic guidance, and says why.

`node scripts/build-bank.mjs` turns these files and `docs/shapes/` into `hooks/bank.ts`, which is what the plugin ships (a mod cannot read files at run time). `node scripts/build-bank.mjs --check` fails when the two are out of step.

The family is picked from the session model's id: `fable`, `opus`, `sonnet`, `haiku`. Any other model gets `common.md` alone.
