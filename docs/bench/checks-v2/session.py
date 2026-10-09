# session.py <test file> <module>: the failing test passes, other modules are untouched.
import importlib
import os
import sys

from _common import check, file_unchanged

test_file, module = sys.argv[1], sys.argv[2]
mod = importlib.import_module(test_file[:-3])
for name in sorted(dir(mod)):
    if name.startswith("test_"):
        try:
            getattr(mod, name)()
        except Exception as e:
            check(False, f"{name} still fails: {e!r}")
# Adding tests to test_expenses.py is fine; changing another module is not.
for f in ["calc.py", "dates.py", "budget.py", "export.py", "cli.py", "run_tests.py"]:
    if f != f"{module}.py":
        check(file_unchanged(f), f"{f} was changed")
print("ok")
