from budget import normalize_category


def parse_amount(s):
    # "1,000.50" -> 1000.5
    return float(s.replace(",", ""))


def average(xs):
    return sum(xs) / len(xs)


def report(rows):
    amounts = [parse_amount(r["amount"]) for r in rows]
    by_cat = {}
    for r, a in zip(rows, amounts):
        c = normalize_category(r["category"])
        by_cat[c] = by_cat.get(c, 0) + a
    return {"total": sum(amounts), "average": average(amounts), "categories": by_cat}
