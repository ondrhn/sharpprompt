# fix
Something is broken and should work again.
Fields: what goes wrong and where it shows, what should happen instead, what must stay as it is, how to tell it is fixed.
Context: the last test run showed test_login_redirect failing after the session refactor in auth/session.py.
Before: login broken again after your change, fix
After: test_login_redirect started failing after the session refactor in auth/session.py. Find out why and fix it so a correct password lands on the dashboard again. Keep the refactor's new structure. Done when test_login_redirect and the rest of the auth tests pass.
