def average(xs):
    return sum(xs) / len(xs)


def report(rows):
    amounts = [float(r["amount"].replace(",", "")) for r in rows]
    return {"total": sum(amounts), "average": average(amounts)}
