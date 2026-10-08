import csv
import sys

from calc import report


def main(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    r = report(rows)
    print(f"total {r['total']:.2f}  average {r['average']:.2f}")
    for cat, amount in sorted(r["categories"].items()):
        print(f"  {cat}: {amount:.2f}")


if __name__ == "__main__":
    main(sys.argv[1])
