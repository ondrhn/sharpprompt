# expenses

Turns a month of expense rows into the totals the monthly email job sends.

- `calc.py`: amounts, average and median, and the month report
- `dates.py`: month and week keys, days per month
- `budget.py`: budget checks (`over_budget`, `near_budget`) and alerts
- `export.py`: CSV exports: every row (`report_csv`) or totals per category (`category_csv`)
- `cli.py`: `python3 cli.py rows.csv` prints the report

Run the tests with `python3 run_tests.py`.
