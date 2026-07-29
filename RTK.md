# RTK - Rust Token Killer (Codex CLI)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Use `rtk` for supported commands when output may be substantial or its
transformer is useful, including searches, large diffs, builds, tests, lint,
installations, logs, process listings, and large HTTP responses.

Run predictably concise commands directly, such as `git status --short`,
`git diff --stat`, `pwd`, `which`, `echo`, and small directory listings.
Do not add `rtk` merely to satisfy a prefix rule.

Examples:

```bash
rtk rg -n "pattern" src
rtk git diff
rtk cargo test
rtk npm run build
rtk pytest -q
git status --short
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```
