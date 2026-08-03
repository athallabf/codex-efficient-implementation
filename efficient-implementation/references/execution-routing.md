# Execution routing

Use parallel tool calls when two or more already-selected operations are independent, useful to the current decision, and parallelism reduces latency without weakening sequencing.

For already-selected validation, execute independent commands directly in one native parallel wave. Prefer RTK where available and set modest output limits. Multiple local processes in one wave do not imply multiple model decisions.

Bound each result at the source. Parallel execution that returns several large file dumps may save latency but increases context cost; split waves when the output is not decision-relevant.

Good evidence wave:

- search for an exact route, service symbol, repository method, and related tests;
- inspect several already-known files;
- run independent read-only Git inspections;
- run already-selected test, lint, and type-check commands.

Return to semantic reasoning when output determines the next operation. Do not guess a file after a search, mutate before evidence is sufficient, or add unrelated commands merely to create a batch.

For tool discovery, return matching names first. Load descriptions only for the small set that could solve the current task; never emit the complete catalog.

Use the bounded-output helper only when a command is predictably noisy or complete raw logs must be retained despite truncation. Do not use it for concise Git inspection, searches, bounded reads, focused tests, or normally quiet validation. The helper does not schedule work, infer dependencies, or change sandbox and approval behavior; native tools remain responsible for parallelism.
