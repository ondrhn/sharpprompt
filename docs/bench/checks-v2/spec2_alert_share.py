from _common import check
from budget import alerts

res = alerts({"Food": 150.0}, {"Food": 100.0})
check(res == ["Food: 150%"], f"unexpected alerts: {res!r}")
print("ok")
