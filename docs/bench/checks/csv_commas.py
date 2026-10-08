import csv
import io

from _common import check
from export import report_csv

rows = [{"date": "2026-09-02", "name": "Smith, John", "category": "Food", "amount": "12.40"}]
back = list(csv.DictReader(io.StringIO(report_csv(rows))))
check(len(back) == 1 and back[0]["name"] == "Smith, John" and back[0]["amount"] == "12.40", f"read back {back}")
print("ok")
