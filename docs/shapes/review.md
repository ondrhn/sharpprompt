# review
Look over work and report problems.
Fields: what to review, what kind of problems matter, what to leave alone, the form of the findings.
Context: the user just finished a branch adding rate limiting to the API gateway.
Before: review my changes
After: Review the rate limiting changes on this branch for bugs: wrong limits, race conditions, requests that slip through, and errors that would reach users. Skip style and naming. List each finding with the file and line and why it is a problem, most serious first. Don't change the code.
