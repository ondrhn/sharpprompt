import os
import sys

sys.path.insert(0, os.getcwd())


def check(cond, msg):
    if not cond:
        print(f"FAIL {msg}")
        sys.exit(1)
