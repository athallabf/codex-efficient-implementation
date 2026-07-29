# Codex Efficient Implementation

A portable Codex workflow focused on cost per verified successful task rather
than token minimization alone.

This repository contains:

- `efficient-implementation/`: the complete reusable skill;
- `config.toml`: portable model, reasoning, Code Mode, memory, and TUI settings;
- `AGENTS-snippet.md`: optional global activation instruction.

It intentionally excludes credentials, authentication state, provider routing,
trusted project paths, hooks, approval and sandbox policy, session history, and
machine-specific installation markers.

## Install the skill

```bash
git clone https://github.com/athallabf/codex-efficient-implementation.git
cd codex-efficient-implementation
mkdir -p ~/.agents/skills
cp -R efficient-implementation ~/.agents/skills/
```

If that destination already exists, review and back it up before replacing it.

## Configure Codex

Review `config.toml` and merge the settings you want into
`~/.codex/config.toml`. Do not blindly overwrite an existing configuration.

The Sol Code Mode batching reference is retained for explicit experiments but
is not enabled globally. Native Code Mode and normal parallel execution remain
enabled.

`bounded-run.mjs` is optional. Use it only for predictably noisy commands or
when complete raw logs must be retained; direct execution is cheaper for
normally concise checks.

## License

MIT
