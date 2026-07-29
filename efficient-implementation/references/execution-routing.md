# Execution routing

Use native parallel tool calls when two or more operations are independent and all are useful to the current decision.

For already-selected validation, execute independent commands directly in one native parallel wave. Prefer RTK where available and set modest output limits. Multiple local processes in one wave do not imply multiple model decisions.

Bound the combined result as well as each operation. Parallel execution that returns several large file dumps saves latency but increases context cost. Default to roughly 2–3K output tokens per inspection result and require a specific reason before requesting more than 6K from a combined inspection call.

Good evidence wave:

- search for an exact route, service symbol, repository method, and related tests;
- inspect several already-known files;
- run independent read-only Git inspections;
- run already-selected test, lint, and type-check commands.

Return to semantic reasoning when output determines the next operation. Do not guess a file after a search, mutate before evidence is sufficient, or add unrelated commands merely to create a batch.

For tool discovery, return matching names first. Load descriptions only for the small set that could solve the current task; never emit the complete catalog.

Use the bounded-output helper only when a command is predictably noisy or complete raw logs must be retained despite truncation. Do not use it for concise Git inspection, searches, bounded reads, focused tests, or normally quiet validation. The helper does not schedule work, infer dependencies, or change sandbox and approval behavior; native tools remain responsible for parallelism.
