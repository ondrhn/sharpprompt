from _common import check
from export import report_csv

rows = [{"date": "2026-09-02", "name": "", "category": "Food", "amount": "12.40"}]
lines = report_csv(rows).splitlines()
check(lines[1] == "2026-09-02,n/a,Food,12.40", f"unexpected row: {lines[1]!r}")
print("ok")
