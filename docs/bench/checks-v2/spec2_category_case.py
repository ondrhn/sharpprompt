from _common import check, cli
from budget import normalize_category

check(normalize_category(" Food ") == "food", "should be stripped and lowercase")
check(normalize_category("food") == "food", "lowercase stays")
out = cli()
check("  food: 42.50" in out, "merged lowercase line missing")
check("Food:" not in out, "capitalised line should be gone")
print("ok")
