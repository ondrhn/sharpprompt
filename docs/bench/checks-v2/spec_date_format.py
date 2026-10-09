from _common import check
from export import report_csv

out = report_csv([{"date": "2026-09-02", "name": "Bakery", "category": "Food", "amount": "12.40"}]).splitlines()
check(out[1].split(",")[0] == "02.09.2026", f"row {out[1]!r}")
print("ok")
