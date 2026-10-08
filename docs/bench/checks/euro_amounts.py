from _common import check
from calc import parse_amount

for s, want in [("1.000,50", 1000.5), ("12,50", 12.5), ("2.345.678,90", 2345678.9)]:
    got = parse_amount(s)
    check(abs(got - want) < 1e-9, f"parse_amount({s!r}) = {got}, want {want}")
print("ok")
