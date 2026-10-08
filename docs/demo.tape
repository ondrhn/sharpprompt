# Records docs/demo.gif: one rough prompt, the rewrite lands in the box, Enter.
# Run from the repository root: vhs docs/demo.tape
# Needs vhs and ttyd. The demo project is copied to /tmp/expenses first; the
# first run there asks whether you trust the folder, so open it once by hand.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1200
Set Height 640
Set Padding 16
Set TypingSpeed 45ms
Set Theme "Builtin Light"

Hide
Type "rm -rf /tmp/expenses && cp -r docs/demo/expenses /tmp/expenses && cd /tmp/expenses && clear"
Enter
Type "claude --setting-sources '' --permission-mode default --plugin-dir $OLDPWD"
Enter
Sleep 9s
Show

Sleep 1s
Type "the empty month thing from the notes still crashes report, fix it"
Sleep 600ms
Enter
Sleep 9s
Sleep 2.5s
Enter
Sleep 7s

Hide
Ctrl+C
Ctrl+C
