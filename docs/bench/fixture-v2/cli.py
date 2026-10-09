import csv
import sys

from budget import alerts
from calc import report


def print_report(r):
    print(f"total {r['total']:.2f}  average {r['average']:.2f}")
    for cat, amount in sorted(r["categories"].items()):
        print(f"  {cat}: {amount:.2f}")


def print_alerts(lines):
    for line in lines:
        print(f"! {line}")


def main(path, limits=None):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    r = report(rows)
    print_report(r)
    print_alerts(alerts(r["categories"], limits or {}))


if __name__ == "__main__":
    main(sys.argv[1])
