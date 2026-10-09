from _common import check, cli

out = cli()
check("Fun" not in out, "Fun (9.00) should be hidden")
check("Food: 12.40" in out, "Food (12.40) should stay")
check("total 1051.50" in out.replace(",", ""), "the total line keeps every expense")
print("ok")
