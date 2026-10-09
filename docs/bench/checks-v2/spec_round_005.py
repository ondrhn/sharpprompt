from _common import check
from calc import report

r = report([{"amount": "10.02", "category": "Food"}, {"amount": "3.01", "category": "Fun"}])
check(abs(r["total"] - 13.05) < 1e-9, f"total {r['total']} (13.03 rounded to 0.05 is 13.05)")
r = report([{"amount": "10.01", "category": "Food"}])
check(abs(r["total"] - 10.0) < 1e-9, f"total {r['total']} (10.01 rounded to 0.05 is 10.00)")
print("ok")
