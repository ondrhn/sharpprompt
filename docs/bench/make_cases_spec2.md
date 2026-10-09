You are writing test cases for a benchmark of coding assistants. Each case is a short, rough request a developer types about a small Python project, plus one thing the developer has in mind and did not write down. The benchmark checks whether the assistant ends up doing that unwritten thing.

The project, its two format examples, the shared check helpers and one example check follow this text.

Write 14 cases. Each one:

- `id`: `spec2-<short-name>`, lowercase with hyphens.
- `family`: `hidden-spec-2`.
- `shape`: `build` or `fix`.
- `context`: an empty list, or one user message that sets the scene without giving the answer (who reads the output, where it goes).
- `raw`: what the developer types. 6 to 12 words, lowercase, casual. It names the thing that has to change but never its value. "the export breaks in finance's spreadsheet, fix the encoding" is fine; "write the export as utf-8 with bom" is not.
- `hidden.spec`: the one exact requirement the developer has in mind, specific enough that a single small script can test it. Name the function and the exact expected output.
- `hidden.why`: one sentence on why neither the code nor the request tells the assistant this value; a reasonable developer could guess something else.
- `expect`: one sentence, what a good result does.
- `check`: `{"script": "spec2_<name>.py", "args": []}`.
- `check_source`: the full text of that script. It runs from inside a copy of the project, with the helpers folder on `PYTHONPATH`, imports `check` (and `cli` if it needs the printed output) from `_common`, exits 0 with "ok" when the requirement is met and 1 otherwise. It must fail on the project as it is now, and pass after a correct, small change. Test only the hidden requirement, not unrelated behaviour.

Rules:

- Do not use these kinds of hidden value, the benchmark already has them: a separator or delimiter, a threshold or percentage limit, a count or how many items to show, a sort order of rows or categories, a currency, a date format, a file name or function name.
- Pick from kinds like these, or others of the same nature: text encoding of a file (e.g. utf-8 with BOM), the decimal separator in printed numbers, the first day of the week, a unit (km or miles, cents or whole units), a time zone, the language of output labels, a placeholder for empty or missing values, whether a header line is written, how ties are broken, a cap on output lines, the name of a fallback category for blank ones, showing a share as a percentage or an absolute amount, the subject line of a report email. Use each kind at most once.
- The current code must not already contain or hint at the answer, and the answer must not be the only sensible choice. If a careful developer reading the code would land on the value without asking, drop the case.
- Every case changes a function that already exists in the project; no new functions or files, so the only unknown is the value.
- Keep each check short and deterministic; no network, no clock, no randomness.

Reply with a JSON array of the 14 cases and nothing else.

---

How the input is put together (`make_cases_spec2.py` does this): the text above, then each file of `fixture-v2` except tests' caches, then the cases `spec-csv-separator` and `spec-near-75` from `cases-v2.jsonl` as format examples, then `checks-v2/_common.py` and `checks-v2/spec_near_75.py`. Nothing else: no plugin code, no rewrite instructions, no rules. It runs as `claude -p --model claude-sonnet-5-5 --tools '' --setting-sources ''` in an empty folder.

The reply of the run used for the corpus is `make_cases_spec2.reply.json` (14 cases). Ten went into `cases-v2.jsonl` unchanged. Four were left out because the context or the code already gives the value away: `spec2-bank-encoding` (an old Windows machine points to cp1252, and latin-1 passes the check too), `spec2-no-header` (the importer "has its own headings"), `spec2-csv-line-ending` (an old Windows tool points to CRLF) and `spec2-empty-average` (0 is the one usual answer). Every kept check was run on a fresh copy of `fixture-v2`: it fails as the project is, and passes after a small hand-written fix (not committed).
