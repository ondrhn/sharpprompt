from _common import check
from calc import median

check(median([1, 2, 3, 4]) == 2, "median of 1..4 should be 2")
check(median([10, 20]) == 10, "median of 10,20 should be 10")
check(median([5, 1, 3]) == 3, "odd length unchanged")
print("ok")
