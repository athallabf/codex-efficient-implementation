---
name: efficient-implementation
description: Use for repository audits, security reviews, features, bug fixes, refactors, and test fixes that require focused inspection and risk-appropriate validation. Do not use for casual questions, explanations, brainstorming, architecture-only discussion, or factual lookups.
---

# Efficient implementation

Optimize cost per verified success, not token count alone.

## Classify the work and set the boundary

Classify the request as an answer, audit, diagnosis, change, or publication.

For an answer, audit, or diagnosis, keep the work read-only unless the user also requests a change. For a change, identify internally:

- requested behavior and acceptance criteria;
- compatibility, security, and data-integrity constraints;
- explicit non-goals and likely files in scope;
- evidence that proves completion;
- stopping conditions.

Keep this implicit for small tasks, but do not skip the boundary when scope or risk is uncertain.

## Gather the smallest sufficient evidence

Request independently useful evidence for the current semantic decision. Prefer exact symbols, focused directories, bounded ranges, relevant diffs, and source-shaped output. Avoid generic broad searches, generated trees, dependencies, lockfiles, and unchanged content already in context.

Use one evidence wave per decision. Parallelize already-selected independent operations when it reduces latency and does not weaken sequencing; return to reasoning when a result determines the next operation. Do not add inspections merely to fill a batch or pre-plan commands whose arguments depend on unknown output. See [execution routing](references/execution-routing.md).

For audits, prioritize high-risk paths and actionable findings. Stop gathering once findings can be ranked and supported.

## Check scope and complexity before designing

Before adding a registry, abstraction, lifecycle stage, cross-module dependency, or broad inventory, identify:

1. the exact acceptance criterion it satisfies;
2. the simpler existing-path implementation considered;
3. the reason the added maintenance and test cost is justified.

Do not convert a scoped issue into a broad audit automatically. Keep adjacent bugs, cleanup, modernization, and broader audits as follow-up findings unless they are required for safety or explicitly authorized. A demonstrated equivalent exploit may expand scope only when leaving it unfixed would make the requested behavior unsafe; record that dependency.

Verify framework lifecycle ordering and input availability before adding a second-stage authorization or validation path. If required input is unavailable at the enforcement point, document the boundary and stop unless the user authorizes an API or lifecycle redesign.

Do not call coverage exhaustive unless the discovery method supports that claim. When implementation reveals a larger design, pause, restate the expanded scope, and reassess before editing further.

## Implement the smallest compatible change

Once the location or root cause is established, use the existing shared path when it satisfies the requirement. Add the minimum readable code consistent with repository patterns. Preserve public APIs, persisted data, configuration, event schemas, and externally observable behavior unless a breaking change is authorized.

Keep inline shell and JavaScript orchestration simple enough to audit. For quoting-heavy parsers or validation loops, prefer an existing helper or run a cheap syntax or fixture check before trusting the result. A failed checker is not evidence that the target failed; diagnose the checker before retrying or reporting it.

## Preserve readiness gates

Treat configuration consistency and operational readiness as separate conclusions. Before recommending a consequential action such as a migration, reboot, deployment, or destructive operation, identify required evidence, backup, authorization, and recovery gates.

If a required gate remains unverified, lead with `not ready` and give only the steps needed to close that gate. Do not present the consequential action sequence as clearance.

## Validate by risk

Start narrow and broaden only when risk warrants it:

1. specific failing or new regression test;
2. related test file or package;
3. module suite;
4. lint, type check, or build;
5. broader repository validation.

Run the full suite first only when targeted validation is unavailable, behavior is genuinely broad, repository instructions require it, or the user requests it. See [validation ladder](references/validation-ladder.md).

Use `bounded-run` only when output is predictably large or complete raw logs must survive model-visible truncation. Do not use it for concise Git inspection, searches, bounded file reads, focused tests, or normally quiet checks. The helper is output control, not an execution or security boundary.

## Prevent loops and stop deliberately

Do not rerun an identical failure, search, or status check against unchanged state without a new hypothesis, an intervening change, or a plausible transient cause. After a failed validation, inspect the relevant failure, update the hypothesis, make one focused correction, and rerun the narrowest affected check. Do not adopt unrelated pre-existing failures.

Stop when behavior is implemented or the finding is supported, risk-appropriate checks pass or are explicitly blocked, the diff is in scope, and no agent-caused failure remains. State what changed, what was validated, and every unresolved limitation.
