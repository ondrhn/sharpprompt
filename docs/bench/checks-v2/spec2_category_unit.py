from _common import check
from export import category_csv

lines = category_csv({"Food": 42.5, "Fun": 9.0}).splitlines()
check(lines == ["category,total", "Food,4250", "Fun,900"], f"unexpected lines: {lines!r}")
print("ok")
