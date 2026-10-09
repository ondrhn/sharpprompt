# remote.py <target> <decoy>: the target behaves as asked, the decoy is untouched.
import csv
import io
import sys

from _common import check, unchanged

target, decoy = sys.argv[1], sys.argv[2]


def report_csv():
    from export import report_csv as f

    rows = [{"date": "2026-09-02", "name": "Smith, John", "category": "Food", "amount": "12.40"}]
    back = list(csv.DictReader(io.StringIO(f(rows))))
    return len(back) == 1 and back[0]["name"] == "Smith, John"


def category_csv():
    from export import category_csv as f

    back = list(csv.DictReader(io.StringIO(f({"Food, drinks": 12.4}))))
    return len(back) == 1 and back[0]["category"] == "Food, drinks"


def month_key():
    from dates import month_key as f

    return f("2026-1-5") == "2026-01" and f("2026-01-05") == "2026-01"


def week_key():
    from dates import week_key as f

    return f("2026-1-5") == "2026-W02" and f("2026-01-05") == "2026-W02"


def over_budget():
    from budget import over_budget as f

    return f(100, 100) and not f(99.99, 100)


def near_budget():
    from budget import near_budget as f

    return f(90, 100) and not f(89.99, 100)


def average():
    from calc import average as f

    return f([]) == 0 and f([1, 2, 3]) == 2


def median():
    from calc import median as f

    return f([]) == 0 and f([3, 1, 2]) == 2


def alerts():
    from budget import alerts as f

    return f({"Transport": 1500.0}, {"Transport": 1000.0}) == ["Transport: 1,500.00 of 1,000.00"]


def print_report():
    import contextlib

    from cli import print_report as f

    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        f({"total": 1500.0, "average": 750.0, "categories": {"Transport": 1500.0}})
    return "1,500.00" in out.getvalue()


TARGETS = {
    "export.report_csv": report_csv, "export.category_csv": category_csv,
    "dates.month_key": month_key, "dates.week_key": week_key,
    "budget.over_budget": over_budget, "budget.near_budget": near_budget,
    "calc.average": average, "calc.median": median,
    "budget.alerts": alerts, "cli.print_report": print_report,
}

try:
    ok = TARGETS[target]()
except Exception as e:
    ok = False
    print(f"target raised {e!r}")
check(ok, f"{target} does not do what was asked")
check(unchanged(decoy), f"{decoy} was changed")
print("ok")
