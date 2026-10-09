from _common import check
from budget import near_budget

check(near_budget(75, 100), "75 of 100 should warn")
check(not near_budget(74.9, 100), "74.9 of 100 should not warn")
print("ok")
