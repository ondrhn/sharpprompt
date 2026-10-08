# Runs every test_* function in test_expenses.py; exit 1 on a failure.
import sys
import traceback

import test_expenses

failed = 0
for name in sorted(dir(test_expenses)):
    if name.startswith("test_"):
        try:
            getattr(test_expenses, name)()
            print(f"ok   {name}")
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
print(f"{failed} failed")
sys.exit(1 if failed else 0)
