# Writes the generator input for the hidden-spec-2 cases and runs it once.
# The generator sees only make_cases_spec2.md, the fixture, two format
# examples and the check helpers, never the plugin's rewrite instructions.
# Run from docs/bench; the reply goes to the path given (default spec2-raw.json).
import json
import os
import subprocess
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
instr = open(os.path.join(here, "make_cases_spec2.md")).read().split("\n---\n")[0]
parts = [instr, "\n## The project (fixture)\n"]
fx = os.path.join(here, "fixture-v2")
for name in sorted(os.listdir(fx)):
    path = os.path.join(fx, name)
    if os.path.isfile(path):
        parts.append(f"### {name}\n```\n{open(path).read()}```\n")
parts.append("\n## Two existing cases, for the format only\n")
for line in open(os.path.join(here, "cases-v2.jsonl")):
    c = json.loads(line)
    if c["id"] in ("spec-csv-separator", "spec-near-75"):
        parts.append(line.strip() + "\n")
parts.append("\n## Check helpers\n")
for name in ("_common.py", "spec_near_75.py"):
    parts.append(f"### {name}\n```\n{open(os.path.join(here, 'checks-v2', name)).read()}```\n")
prompt = "\n".join(parts)

env = {k: v for k, v in os.environ.items() if k not in ("CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE")}
with tempfile.TemporaryDirectory() as d:
    r = subprocess.run(["claude", "-p", "--model", "claude-sonnet-5-5", "--tools", "", "--setting-sources", "", "--no-session-persistence", "--output-format", "json"],
                       input=prompt, capture_output=True, text=True, cwd=d, env=env, timeout=900)
out = json.loads(r.stdout)
dest = sys.argv[1] if len(sys.argv) > 1 else "spec2-raw.json"
open(dest, "w").write(out.get("result", ""))
print(f"{dest}: cost {out.get('total_cost_usd')}")
