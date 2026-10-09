# Runs every test_* function in every test_*.py file here; exit 1 on a failure.
import glob
import importlib
import sys
import traceback

failed = 0
for path in sorted(glob.glob("test_*.py")):
    mod = importlib.import_module(path[:-3])
    for name in sorted(dir(mod)):
        if name.startswith("test_"):
            try:
                getattr(mod, name)()
                print(f"ok   {path[:-3]}.{name}")
            except Exception:
                failed += 1
                print(f"FAIL {path[:-3]}.{name}")
                traceback.print_exc(limit=1)
print(f"{failed} failed")
sys.exit(1 if failed else 0)
