from _common import check
from budget import normalize_category

check(normalize_category("") == "Misc", "empty should be Misc")
check(normalize_category("   ") == "Misc", "whitespace should be Misc")
check(normalize_category(" Food ") == "Food", "normal names still stripped")
print("ok")
