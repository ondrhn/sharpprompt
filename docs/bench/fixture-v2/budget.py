def normalize_category(name):
    return name.strip()


def over_budget(spent, limit):
    return spent > limit


def near_budget(spent, limit):
    # warn once spending reaches 90% of the limit
    return spent > 0.9 * limit


def alerts(totals, limits):
    out = []
    for cat, spent in totals.items():
        lim = limits.get(cat)
        if lim is not None and over_budget(spent, lim):
            out.append(f"{cat}: {spent:.2f} of {lim:.2f}")
    return out
