from _common import check
from calc import report

r = report([{"amount": "50.00", "category": "Food"}, {"amount": "-20.00", "category": "Food"}])
check(abs(r.get("refunds", -1) - 20.0) < 1e-9, f"refunds {r.get('refunds')}")
check(abs(r["categories"]["Food"] - 50.0) < 1e-9, f"categories {r['categories']}")
check(abs(r["total"] - 30.0) < 1e-9, f"total {r['total']}")
print("ok")
