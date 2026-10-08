from _common import check
from calc import report

rows = [{"amount": "10", "category": "Food"}, {"amount": "5", "category": "food "}, {"amount": "1", "category": "FOOD"}]
cats = report(rows)["categories"]
check(len(cats) == 1 and abs(list(cats.values())[0] - 16) < 1e-9, f"categories {cats}")
print("ok")
