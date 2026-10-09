from _common import check
from dates import week_key

check(week_key("2026-01-04") == week_key("2026-01-10"), "Sunday..Saturday should share a key")
check(week_key("2026-01-04") == week_key("2026-01-05"), "Sunday and Monday should share a key")
check(week_key("2026-01-03") != week_key("2026-01-04"), "Saturday and next Sunday should differ")
check(week_key("2026-01-10") != week_key("2026-01-11"), "next Sunday starts a new week")
print("ok")
