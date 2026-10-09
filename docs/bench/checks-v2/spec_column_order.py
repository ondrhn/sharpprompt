from _common import check
from export import report_csv

out = report_csv([{"date": "2026-09-02", "name": "Bakery", "category": "Food", "amount": "12.40"}]).splitlines()
check(out[0] == "amount,date,category,name", f"header {out[0]!r}")
check(out[1] == "12.40,2026-09-02,Food,Bakery", f"row {out[1]!r}")
print("ok")
