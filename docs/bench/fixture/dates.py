import datetime


def month_key(date_str):
    # "2026-01-05" -> "2026-01"
    d = datetime.date.fromisoformat(date_str)
    return f"{d.year:04d}-{d.month:02d}"


def days_in_month(year, month):
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return days[month - 1]


def daily_average(total, year, month):
    return total / days_in_month(year, month)
