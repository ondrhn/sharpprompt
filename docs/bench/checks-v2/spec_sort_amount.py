from _common import check, cli

lines = [l.strip() for l in cli().splitlines()[1:] if l.strip()]
names = [l.split(":")[0] for l in lines]
check(names[:2] == ["Transport", "food"] and names[-1] == "Fun", f"order {names}")
print("ok")
