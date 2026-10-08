from _common import check
from budget import alerts, over_budget

check(over_budget(100, 100), "spending exactly the limit should count")
check(not over_budget(99.99, 100), "below the limit should not count")
check(alerts({"Food": 100.0}, {"Food": 100.0}) == ["Food: 100.00 of 100.00"], "alert at the limit")
print("ok")
