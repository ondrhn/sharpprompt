from _common import check, cli

first = cli().splitlines()[0]
check(first == "toplam 1051.50  ortalama 262.88", f"unexpected first line: {first!r}")
print("ok")
