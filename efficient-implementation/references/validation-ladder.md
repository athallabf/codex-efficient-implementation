# Validation ladder

Match validation breadth to failure impact.

| Change | Start with | Broaden when |
| --- | --- | --- |
| Known local bug | failing regression test | shared code path changed |
| Parser or utility | utility test file | public contract changed |
| Cross-file feature | feature tests | type or build surface changed |
| Configuration | syntax/static validator | deployment behavior is affected |
| Refactor | nearest behavioral tests | module boundaries changed |

Inspect the final diff after checks. Passing tests do not excuse unrelated edits, generated artifacts, or scope drift.
