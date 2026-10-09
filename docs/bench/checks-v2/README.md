# Checks for the v2 corpus

Run from inside a copy of `fixture-v2` after a run, with this folder on `PYTHONPATH`. Exit 0 means the case's goal is met.

- `spec_*.py`: hidden-spec cases. Each tests the one constraint the user had in mind and never wrote down (the case's `hidden` field).
- `remote.py <target> <decoy>`: remote-reference cases. The target function must now do what the conversation asked, and the decoy, the other function the request could have meant, must be exactly as it was.
- `session.py <test file> <module>`: session-state cases. The failing test the session last ran must pass, and every other module of the fixture must be exactly as it was.
