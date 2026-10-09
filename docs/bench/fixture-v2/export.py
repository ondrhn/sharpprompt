def report_csv(rows):
    lines = ["date,name,category,amount"]
    for r in rows:
        lines.append(f'{r["date"]},{r["name"]},{r["category"]},{r["amount"]}')
    return "\n".join(lines) + "\n"


def category_csv(totals):
    lines = ["category,total"]
    for cat, total in totals.items():
        lines.append(f"{cat},{total:.2f}")
    return "\n".join(lines) + "\n"
