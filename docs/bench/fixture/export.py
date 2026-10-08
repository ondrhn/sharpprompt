def report_csv(rows):
    lines = ["date,name,category,amount"]
    for r in rows:
        lines.append(f'{r["date"]},{r["name"]},{r["category"]},{r["amount"]}')
    return "\n".join(lines) + "\n"
