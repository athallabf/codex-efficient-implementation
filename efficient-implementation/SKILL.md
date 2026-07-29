---
name: efficient-implementation
description: Use for repository audits, security reviews, features, bug fixes, refactors, and test fixes requiring focused inspection and validation. Gather the smallest sufficient evidence wave, make a focused change or finding, validate by risk, and stop when verified.
---

# Efficient implementation

Optimize cost per verified success, not token count alone.

## Establish the finish line

Identify internally:

- requested behavior and compatibility constraints;
- likely files in scope;
- tests or external evidence that prove completion;
- stopping conditions.

Keep this implicit for small tasks.

## Gather the smallest sufficient evidence wave

For the current decision, request the independently useful evidence that is likely to affect the decision. Run independent operations concurrently, but do not add inspections merely to fill a batch.

One wave supports one semantic decision; it is not permission to dump a repository. Keep individual inspection results near 2–3K output tokens. Do not raise a combined inspection call above 6K output tokens without a specific need. Prefer selected ranges over complete files.

Shape output at the source before raising caps: narrow log windows and predicates, select relevant fields, return counts or summaries, and read bounded ranges. Do not use model-visible truncation as the normal output-control mechanism. If several independently useful operations are noisy, split them by semantic decision or use `bounded-run` only when their complete logs must be retained.

Do not pre-plan commands whose arguments depend on unknown output. Return to reasoning when a result determines the next action. See [execution routing](references/execution-routing.md).

Prefer `rg`, exact symbols, focused directories, bounded ranges, and relevant diffs. Avoid large files, generic broad searches, generated trees, dependencies, lockfiles, and unchanged content already in context.

During tool discovery, list matching names first and inspect full descriptions only for shortlisted tools. Never return the complete tool catalog. For audits, prioritize high-risk paths and actionable findings; stop gathering once findings can be ranked and supported.

## Implement once evidence is sufficient

Once the location or root cause is established, make the smallest change consistent with repository patterns. Avoid low-value confirmation and unrelated cleanup.

Keep inline shell and JavaScript orchestration simple enough to audit. For quoting-heavy parsers or validation loops, prefer an existing helper or run a cheap syntax or fixture check when malformed output could be mistaken for a target failure. A failed checker is not evidence that the target failed; diagnose the checker before retrying or reporting its result.

## Preserve readiness gates

Configuration consistency and operational readiness are separate conclusions. Before recommending a consequential next step such as rebooting an unstable host, running a migration, or performing a destructive operation, identify any required evidence, backup, and recovery gates.

If a required gate remains unverified, lead with `not ready` and give only the steps needed to close that gate. Do not present the consequential action sequence in a way that could be read as clearance. The user may still choose to proceed independently.

## Validate by risk

Start narrow, then broaden when risk warrants it:

1. specific failing or new regression test;
2. related test file or package;
3. module suite;
4. lint, type check, or build;
5. broader repository validation.

Run the full suite first only when required, targeted checks are unavailable, or behavior is broad. See [validation ladder](references/validation-ladder.md).

Run independent, already-selected checks concurrently through the active native execution path.

Use `bounded-run` only when output is predictably large or complete raw logs must survive model-visible truncation, such as noisy integration suites or verbose failure diagnostics. Do not use it for `git status`, `git diff`, `rg`, bounded file reads, focused tests, or normally quiet lint/build/format checks. Do not probe `--help` first:

```bash
node "$HOME/.agents/skills/efficient-implementation/scripts/bounded-run.mjs" --cwd . --timeout-ms 120000 -- npm test -- orders
```

The helper preserves complete logs and returns deterministic previews. It is an optional output-control fallback, not an execution layer or security boundary. When expected output is already concise, its metadata and artifacts cost more than direct execution.

## Prevent loops

Do not rerun an identical failure against unchanged state without a new hypothesis, an intervening change, or evidence of a plausible transient cause.

After a failed validation, inspect the relevant failure, update the hypothesis, make one focused correction, and rerun the narrowest affected check.

Do not repeat equivalent searches, unchanged reads, or Git status checks without an intervening change.

Do not adopt unrelated pre-existing failures.

## Stop deliberately

Stop when behavior is implemented, risk-appropriate checks pass, the diff is in scope, and no agent-caused failure remains.

Keep updates short. The final response states what changed, what was validated, and any unresolved limitation.
