# Writes cases-v2.jsonl: three families of ten cases where a rewrite could
# add something the model does not have. Run from docs/bench. Deterministic.
import json
import os
import random
import shutil
import subprocess
import tempfile

random.seed(20261009)
U = lambda t: {"role": "user", "text": t}
A = lambda t, uses=None: {"role": "assistant", "text": t, **({"toolUses": uses} if uses else {})}

# ---------------------------------------------------------------- family 1
# The user has one constraint in mind that neither the request nor the
# project shows. The check tests that constraint.
HIDDEN = [
    ("spec-csv-separator", "build", [U("Finance imports our CSV exports into their accounting tool every month.")],
     "make the csv export work with finance's import tool",
     "report_csv must use a semicolon as the separator (header date;name;category;amount); finance's accounting tool reads semicolon-separated files.",
     "Which separator another team's tool wants is not in the code or the request.",
     "spec_csv_separator.py", "report_csv writes semicolon-separated lines."),
    ("spec-near-75", "build", [],
     "budget warnings come too late, make them warn earlier",
     "near_budget should warn from 75% of the limit (75 of 100 warns, 74.9 does not).",
     "How much earlier is the team's choice; 80% would be as reasonable a guess as 75%.",
     "spec_near_75.py", "near_budget warns from 75% of the limit."),
    ("spec-date-format", "build", [U("The finance team reads the CSV export by hand before importing it.")],
     "dates in the csv export should look the way finance writes them",
     "report_csv must write dates as DD.MM.YYYY (2026-09-02 becomes 02.09.2026).",
     "How finance writes dates is a local habit nothing in the project records.",
     "spec_date_format.py", "report_csv writes dates as DD.MM.YYYY."),
    ("spec-refunds", "fix", [U("Some rows in the bank export have negative amounts now.")],
     "negative amounts keep showing up, handle them properly",
     "Negative amounts are refunds: leave them out of the category totals and give their sum, as a positive number, in report()['refunds']; the overall total stays net.",
     "Rejecting negatives is the usual guess; that they are refunds and where finance wants them is something only the user knows.",
     "spec_refunds.py", "report() keeps refunds out of the categories and reports them under 'refunds'."),
    ("spec-sort-amount", "build", [],
     "sort the categories in the cli output better",
     "print_report should list categories by amount, largest first.",
     "They are already sorted by name; which order is 'better' is a preference.",
     "spec_sort_amount.py", "The CLI lists categories by amount, largest first."),
    ("spec-top3-other", "build", [U("The monthly email shows every category and people stop reading halfway.")],
     "the email lists too many categories, cut it down",
     "print_report should show the 3 largest categories and sum the rest into one line called Other.",
     "How many to keep and what to do with the rest are choices the request does not make.",
     "spec_top3_other.py", "The CLI shows the top 3 categories and an Other line for the rest."),
    ("spec-round-005", "build", [U("Finance keeps asking about the odd cents in the totals.")],
     "round the report totals, finance keeps asking",
     "report()['total'] should be rounded to the nearest 0.05 (cash rounding).",
     "Rounding to cents or whole units are the obvious readings; 0.05 is the team's own rule.",
     "spec_round_005.py", "report() rounds the total to the nearest 0.05."),
    ("spec-eur-suffix", "build", [],
     "show the currency in the cli output",
     "Amounts in the CLI output end with ' EUR' (12.40 EUR); no euro sign.",
     "Sign or code, before or after the number: the request does not say.",
     "spec_eur_suffix.py", "CLI amounts end with ' EUR'."),
    ("spec-hide-small", "build", [U("The report lists categories with a few euros spent next to the big ones.")],
     "tiny categories clutter the report, hide them",
     "print_report should hide categories under 10.00; the total line still counts every expense.",
     "What counts as tiny is a threshold only the user has in mind.",
     "spec_hide_small.py", "The CLI hides categories under 10.00 and keeps the full total."),
    ("spec-column-order", "build", [U("Finance's import tool reads the CSV columns by position.")],
     "reorder the csv export columns for finance's import",
     "report_csv columns must be in the order amount,date,category,name.",
     "The order their tool expects is not in the project.",
     "spec_column_order.py", "report_csv writes amount,date,category,name."),
]

# ---------------------------------------------------------------- family 2
# Two functions fit the request; the conversation discussed both, the one
# meant is the more recent. Touching the other one fails the check.
FILLER = [
    (U("what does cli.py print exactly"), A("It prints the total and the average on one line, then one line per category with its amount, sorted by name.")),
    (U("how are the tests run here"), A("With python3 run_tests.py: it imports every test_*.py file and runs each test_ function, printing ok or FAIL.")),
    (U("is there a requirements file"), A("No, the project only uses the standard library: csv, datetime, sys.")),
    (U("who calls report()"), A("cli.py calls it once per run with the rows from the CSV file; nothing else does.")),
    (U("can you remind me what rows.csv has"), A("Four rows from September 2026: Bakery 12.40 (Food), a bus pass 1,000.00 (Transport), Market 30.10 (food) and Cinema 9.00 (Fun).")),
    (U("does anything write files"), A("No. The exports return strings; whoever calls them decides where they go.")),
    (U("how long has the email job been running"), A("I can't see that from the code. The project has no scheduler; the job must call cli.py from somewhere else.")),
    (U("what python version do we target"), A("Nothing pins it. The code uses f-strings and date.fromisoformat, so 3.7 or newer works.")),
    (U("ok and the README"), A("It lists the five modules and says to run the tests with python3 run_tests.py.")),
    (U("is normalize_category used anywhere else"), A("Only in report(), where it cleans each row's category before summing.")),
    (U("thanks, makes sense"), A("Sure.")),
    (U("is the average the mean or something else"), A("It's the mean: sum of the amounts divided by how many there are.")),
    (U("what happens with an unknown category in the limits"), A("alerts() skips it: it only checks categories that have a limit.")),
    (U("are amounts strings in the csv"), A("Yes, csv.DictReader gives strings; parse_amount turns them into floats.")),
    (U("how many tests are there"), A("Eight in test_expenses.py, all passing right now.")),
    (U("anything slow in here"), A("No, everything is a single pass over the rows.")),
    (U("can the cli take limits"), A("main() takes an optional limits dict, but the command line doesn't pass one yet.")),
    (U("is there logging"), A("No logging; the CLI just prints.")),
    (U("what does days_in_month do"), A("Looks up the number of days from a fixed table indexed by month.")),
    (U("ok cool"), A("Anything else?")),
    (U("did we ever add type hints"), A("No, none of the modules have type hints.")),
    (U("is the output stable between runs"), A("Yes, categories are sorted by name and nothing depends on time.")),
]

PAIRS = {
    "quote": {
        "export.report_csv": (U("report_csv splits the row when a payee has a comma, like 'Smith, John'."),
                              A("Right: report_csv in export.py joins the fields with an f-string, so a comma inside a name breaks the row. It needs proper CSV quoting.")),
        "export.category_csv": (U("category_csv breaks when a category has a comma, like 'Food, drinks'."),
                                A("Yes: category_csv in export.py builds each line with an f-string, so 'Food, drinks' becomes two columns. It needs proper CSV quoting.")),
        "raw": "ok fix the quoting in that csv function u mentioned",
    },
    "short-dates": {
        "dates.month_key": (U("month_key fails on the old bank export's dates like 2026-1-5."),
                            A("It does: month_key in dates.py uses date.fromisoformat, which wants zero-padded parts, so 2026-1-5 raises ValueError. It should accept them.")),
        "dates.week_key": (U("week_key fails on dates like 2026-1-5 from the old export too."),
                           A("Same cause: week_key in dates.py calls date.fromisoformat, so the unpadded 2026-1-5 raises ValueError. It should accept them.")),
        "raw": "make that key function accept the short dates like 2026-1-5",
    },
    "boundary": {
        "budget.over_budget": (U("over_budget doesn't count spending exactly at the limit."),
                               A("Correct: over_budget in budget.py uses spent > limit, so exactly 100 of 100 is not over. It should count the boundary.")),
        "budget.near_budget": (U("near_budget doesn't fire at exactly 90% either."),
                               A("Right: near_budget in budget.py uses spent > 0.9 * limit, so exactly 90 of 100 does not warn. It should count the boundary.")),
        "raw": "fix that budget check so it counts the exact boundary",
    },
    "empty": {
        "calc.average": (U("average blows up on an empty month."),
                         A("Yes: average in calc.py divides by len(xs), so an empty list raises ZeroDivisionError. It should return 0.")),
        "calc.median": (U("median crashes on an empty list too."),
                        A("It does: median in calc.py indexes into the sorted list, so an empty one raises IndexError. It should return 0.")),
        "raw": "that function that crashes on empty input, make it return 0",
    },
    "thousands": {
        "cli.print_report": (U("print_report shows 1500.00, finance wants 1,500.00."),
                             A("print_report in cli.py formats with :.2f; adding thousands separators means :,.2f there.")),
        "budget.alerts": (U("the alert lines show 1500.00 too, finance wants 1,500.00."),
                          A("alerts in budget.py formats spent and limit with :.2f; :,.2f would add the separators.")),
        "raw": "add the thousands separators to that output u mentioned",
    },
}


def long_context(decoy_pair, target_pair):
    pool = FILLER[:]
    random.shuffle(pool)
    n_before = random.randint(3, 5)
    n_between = random.randint(4, 6)
    n_after = random.randint(4, 6)
    ctx = []
    take = lambda k: [m for pair in (pool.pop() for _ in range(k)) for m in pair]
    ctx += take(n_before)
    ctx += list(decoy_pair)
    ctx += take(n_between)
    ctx += list(target_pair)
    ctx += take(n_after)
    return ctx


REMOTE = []
for name, p in PAIRS.items():
    keys = [k for k in p if k != "raw"]
    for target in keys:
        decoy = next(k for k in keys if k != target)
        REMOTE.append((f"ref-{name}-{target.split('.')[1].replace('_', '-')}", target, decoy, long_context(p[decoy], p[target]), p["raw"]))

# ---------------------------------------------------------------- family 3
# The session just ran the tests and one failed; the user says "fix that".
# Earlier messages talk about something else in the project.
SESSION = [
    ("session-average", "calc", "test_empty_month", "from calc import report\n\n\ndef test_empty_month():\n    r = report([])\n    assert r['total'] == 0 and r['average'] == 0\n", "ok fix that"),
    ("session-euro", "calc", "test_euro_amounts", "from calc import parse_amount\n\n\ndef test_euro_amounts():\n    assert parse_amount('1.000,50') == 1000.5\n    assert parse_amount('12,50') == 12.5\n", "yeah fix it"),
    ("session-csv", "export", "test_csv_commas", "import csv\nimport io\n\nfrom export import report_csv\n\n\ndef test_csv_commas():\n    rows = [{'date': '2026-09-02', 'name': 'Smith, John', 'category': 'Food', 'amount': '12.40'}]\n    back = list(csv.DictReader(io.StringIO(report_csv(rows))))\n    assert back[0]['name'] == 'Smith, John'\n", "ok go ahead and fix that"),
    ("session-leap", "dates", "test_leap_february", "from dates import days_in_month\n\n\ndef test_leap_february():\n    assert days_in_month(2028, 2) == 29\n    assert days_in_month(2100, 2) == 28\n", "fix that one"),
    ("session-limit", "budget", "test_at_limit", "from budget import over_budget\n\n\ndef test_at_limit():\n    assert over_budget(100, 100)\n", "ok sort that out"),
    ("session-case", "budget", "test_category_case", "from budget import normalize_category\n\n\ndef test_category_case():\n    assert normalize_category('food ') == normalize_category('Food')\n", "fix that pls"),
    ("session-median", "calc", "test_median_empty", "from calc import median\n\n\ndef test_median_empty():\n    assert median([]) == 0\n", "ok fix that"),
    ("session-week", "dates", "test_week_key_short", "from dates import week_key\n\n\ndef test_week_key_short():\n    assert week_key('2026-1-5') == '2026-W02'\n", "yep fix it"),
    ("session-category-csv", "export", "test_category_csv_commas", "import csv\nimport io\n\nfrom export import category_csv\n\n\ndef test_category_csv_commas():\n    back = list(csv.DictReader(io.StringIO(category_csv({'Food, drinks': 12.4}))))\n    assert back[0]['category'] == 'Food, drinks'\n", "ok fix that"),
    ("session-near", "budget", "test_near_at_90", "from budget import near_budget\n\n\ndef test_near_at_90():\n    assert near_budget(90, 100)\n", "go ahead, fix that"),
]
EARLIER = [
    (U("what does cli.py print"), A("The total and average, then one line per category, sorted by name.")),
    (U("is the README up to date"), A("Yes, it lists the modules and how to run the tests.")),
    (U("does export.py write files"), A("No, both exports return strings.")),
    (U("what does normalize_category do"), A("It strips spaces from a category name, nothing else.")),
    (U("how are amounts parsed"), A("parse_amount removes commas and converts to float.")),
]
READS = ["calc.py", "dates.py", "budget.py", "export.py", "cli.py"]


def test_run(test_name, content):
    """Run the fixture's tests with the case's test file added; return the output."""
    d = tempfile.mkdtemp()
    try:
        shutil.copytree("fixture-v2", d, dirs_exist_ok=True)
        with open(os.path.join(d, "test_regressions.py"), "w") as f:
            f.write(content)
        r = subprocess.run(["python3", "run_tests.py"], cwd=d, capture_output=True, text=True)
        return (r.stdout + r.stderr).strip()
    finally:
        shutil.rmtree(d)


cases = []
for id_, shape, ctx, raw, spec, why, check, expect in HIDDEN:
    cases.append({"id": id_, "family": "hidden-spec", "shape": shape, "context": ctx, "raw": raw,
                  "hidden": {"spec": spec, "why": why}, "check": {"script": check, "args": []}, "expect": expect})
for id_, target, decoy, ctx, raw in REMOTE:
    cases.append({"id": id_, "family": "remote-ref", "shape": "fix", "context": ctx, "raw": raw,
                  "target": target, "decoy": decoy, "check": {"script": "remote.py", "args": [target, decoy]},
                  "expect": f"Changes {target} as the conversation asked and leaves {decoy} exactly as it was."})
for id_, module, test_name, content, raw in SESSION:
    earlier = random.sample(EARLIER, 2)
    reads = random.sample([r for r in READS if r != f"{module}.py"], 2) + [f"{module}.py"]
    out = test_run(test_name, content)
    uses = [{"tool": "Read", "input": {"file_path": r}, "text": ""} for r in reads]
    uses.append({"tool": "Bash", "input": {"command": "python3 run_tests.py"}, "text": out, "isError": True})
    ctx = [m for pair in earlier for m in pair] + [U("run the tests"), A(f"One test fails: {test_name}. Everything else passes.", uses)]
    cases.append({"id": id_, "family": "session-state", "shape": "fix", "context": ctx, "raw": raw,
                  "setup": {"test_regressions.py": content},
                  "check": {"script": "session.py", "args": ["test_regressions.py", module]},
                  "expect": f"Makes {test_name} pass by changing {module}.py only."})

with open("cases-v2.jsonl", "w") as f:
    for c in cases:
        f.write(json.dumps(c, ensure_ascii=False) + "\n")
print(len(cases), "cases;", "context lengths (remote-ref):", [len(c["context"]) for c in cases if c["family"] == "remote-ref"])
