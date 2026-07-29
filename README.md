# Codex Efficient Implementation

A portable Codex workflow focused on cost per verified successful task rather
than token minimization alone.

This repository contains:

- `efficient-implementation/`: the complete reusable skill;
- `config.toml`: portable model, reasoning, Code Mode, memory, and TUI settings;
- `AGENTS.md`: portable global judgment, safety, and repository-execution
  defaults that activate the skill for repository work;
- `RTK.md`: selective Rust Token Killer routing instructions.

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

## Install RTK

Install [RTK](https://github.com/rtk-ai/rtk) before using `RTK.md`.

Homebrew is the upstream-recommended installation:

```bash
brew install rtk
rtk --version
```

For Linux or macOS without Homebrew:

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
rtk --version
```

The bundle uses selective, instruction-based RTK routing. It does not require
installing RTK hooks with `rtk init`.

## Configure Codex

Review `config.toml` and merge the settings you want into
`~/.codex/config.toml`. Do not blindly overwrite an existing configuration.

Review `AGENTS.md`, then copy it and `RTK.md` into `~/.codex/`, or merge them
with your existing global instructions. The portable AGENTS file references
`~/.codex/RTK.md` and omits the unproven always-on Sol batching directive.

Code Mode uses the nested `[features.code_mode]` configuration table. Restart
Codex after changing global configuration or installing the skill.

The Sol Code Mode batching reference is retained for explicit experiments but
is not enabled globally. Native Code Mode and normal parallel execution remain
enabled.

`bounded-run.mjs` is optional. Use it only for predictably noisy commands or
when complete raw logs must be retained; direct execution is cheaper for
normally concise checks. Generated artifacts live under `.codex-efficiency/`,
which should remain ignored by Git.

## Verify the setup

```bash
codex --version
rtk --version
rtk gain
npm test
```

After restarting Codex, ask it to state whether the
`efficient-implementation` skill and global RTK instructions are loaded before
depending on them for important work.

## Development

The helper uses only Node.js built-ins. Run its tests with:

```bash
npm test
```

GitHub Actions runs the same suite on supported Node.js versions.

## License

MIT
