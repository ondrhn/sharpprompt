# Checks

Run from inside a copy of the fixture after a run: `python3 <path>/checks/<name>.py`. Exit 0 means the behaviour the case asked for is there. They are kept outside the fixture so the model never sees them. `regression.py` runs the fixture's own tests.
