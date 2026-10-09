from _common import check, cli

out = cli()
first = out.splitlines()[0]
check(first == "total 1051,50  average 262,88", f"unexpected first line: {first!r}")
print("ok")
