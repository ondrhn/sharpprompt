from _common import check, cli

lines = [l.strip() for l in cli().splitlines()[1:] if l.strip()]
names = [l.split(":")[0] for l in lines]
check(len(names) == 4 and names[-1] == "Other" and "9.00" in lines[-1], f"lines {lines}")
check("Transport" in names and "Fun" not in names, f"names {names}")
print("ok")
