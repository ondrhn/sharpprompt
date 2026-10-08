from budget import alerts, over_budget
from calc import average, parse_amount, report
from dates import days_in_month, month_key
from export import report_csv


def test_parse_amount_us():
    assert parse_amount("1,000.50") == 1000.5


def test_average():
    assert average([1, 2, 3]) == 2


def test_report_total():
    rows = [{"amount": "10", "category": "Fun"}, {"amount": "2.5", "category": "Fun"}]
    assert report(rows)["total"] == 12.5


def test_month_key():
    assert month_key("2026-01-05") == "2026-01"


def test_days_in_month():
    assert days_in_month(2026, 2) == 28
    assert days_in_month(2026, 4) == 30


def test_over_budget():
    assert over_budget(120, 100)
    assert not over_budget(80, 100)


def test_alerts():
    assert alerts({"Food": 150.0}, {"Food": 100.0}) == ["Food: 150.00 of 100.00"]


def test_report_csv_header():
    assert report_csv([]).splitlines()[0] == "date,name,category,amount"
