from _common import check
from calc import report

r = report([])
check(r["total"] == 0 and r["average"] == 0, f"report([]) gave {r}")
print("ok")
