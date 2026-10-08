from _common import check
from dates import days_in_month

check(days_in_month(2028, 2) == 29, "2028-02 should have 29 days")
check(days_in_month(2100, 2) == 28, "2100-02 should have 28 days")
check(days_in_month(2000, 2) == 29, "2000-02 should have 29 days")
check(days_in_month(2026, 2) == 28, "2026-02 should have 28 days")
print("ok")
