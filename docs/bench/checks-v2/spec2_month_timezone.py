from _common import check
from dates import month_key

check(month_key("2026-02-01T03:00:00+00:00") == "2026-01", "Feb 1 03:00 UTC is still January in New York")
check(month_key("2026-07-01T02:00:00+00:00") == "2026-06", "Jul 1 02:00 UTC is still June in New York")
check(month_key("2026-03-15T12:00:00+00:00") == "2026-03", "midday stays in March")
print("ok")
