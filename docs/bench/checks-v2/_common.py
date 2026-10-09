import ast
import contextlib
import io
import os
import subprocess
import sys

sys.path.insert(0, os.getcwd())
ORIGINAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixture-v2")


def check(cond, msg):
    if not cond:
        print(f"FAIL {msg}")
        sys.exit(1)


def _function_source(text, name):
    for node in ast.parse(text).body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.dump(node)
    return None


def unchanged(dotted):
    """True when module.func in the copy is the same code as in fixture-v2."""
    module, func = dotted.split(".")
    with open(os.path.join(ORIGINAL, f"{module}.py")) as f:
        before = _function_source(f.read(), func)
    with open(f"{module}.py") as f:
        after = _function_source(f.read(), func)
    return before is not None and before == after


def file_unchanged(name):
    with open(os.path.join(ORIGINAL, name)) as f:
        before = f.read()
    with open(name) as f:
        return f.read() == before


def cli(rows="rows.csv", limits=None):
    import cli as c

    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        c.main(rows, limits) if limits is not None else c.main(rows)
    return out.getvalue()


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)
