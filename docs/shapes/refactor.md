# refactor
Change how code is organised without changing what it does.
Fields: the code in question, the target structure, the reason, the behaviour that must not change, how to check that.
Context: the conversation showed billing.py at 1,400 lines with tax, invoice and discount logic mixed together.
Before: split up billing its a mess
After: Split billing.py (about 1,400 lines) into separate modules for tax, invoices and discounts, so each can be changed without reading the others. Behaviour must stay exactly the same: no renamed public functions, no logic changes. Done when the existing billing tests pass unchanged.
