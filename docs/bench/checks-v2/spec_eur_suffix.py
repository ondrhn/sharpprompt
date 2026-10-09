from _common import check, cli

out = cli()
check("€" not in out, "no euro sign")
check("12.40 EUR" in out and "1051.50 EUR" in out.replace(",", ""), f"output {out!r}")
print("ok")
