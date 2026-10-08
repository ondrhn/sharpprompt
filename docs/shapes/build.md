# build
Add something new.
Fields: what it does for whom, where it lives, inputs and outputs, what is out of scope, how to tell it works.
Context: the project is a FastAPI service; the user has been discussing exporting reports.
Before: add csv export for reports
After: Add a CSV export for reports so analysts can open them in a spreadsheet: a GET endpoint next to the existing report routes that returns the same rows as the JSON report, one column per field. No new dependencies. Done when the new endpoint returns the same rows as the JSON report for an existing report and the current tests still pass.
