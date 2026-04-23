# claudecode-omc

Claude Code harness — curated best-practice configurations from multiple sources.

Merges skills, agents, hooks, and commands from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) and [superpowers](https://github.com/obra/superpowers) with your own local customizations, using priority-based conflict resolution.

## Install

```bash
npm install -g claudecode-omc
omc-manage setup
```

## What Gets Installed

| Artifact | Count | Sources |
|----------|-------|---------|
| Skills | ~62 | oh-my-claudecode + superpowers |
| Agents | ~19 | oh-my-claudecode + superpowers |
| Hooks | ~8 | oh-my-claudecode (standalone) |
| Commands | ~3 | superpowers |
| Guidelines | 1 | local coding discipline prompt guidelines |

All artifacts are installed to `~/.claude/` where Claude Code discovers them automatically.

The bundled guidelines install into `~/.claude/CLAUDE.md` and add lightweight
coding discipline rules
adapted from [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills):
think before coding, prefer simple solutions, make surgical changes, and verify
completion with concrete evidence.

## Commands

| Command | Description |
|---------|-------------|
| `omc-manage setup [--force] [--dry-run] [--type <type>]` | Install merged artifacts |
| `omc-manage doctor` | Health checks |
| `omc-manage source list` | Show configured sources |
| `omc-manage source sync` | Update upstream sources to latest |
| `omc-manage source add <name> <url>` | Add a new source, including `guidelines` sources |
| `omc-manage artifact list [--type <type>]` | List merged artifacts |
| `omc-manage artifact conflicts [--type <type>]` | Show conflict report |
| `omc-manage guidelines optimize [source...]` | Build maintainer-only guideline optimization artifacts |
| `omc-manage guidelines apply --result-file <path>` | Apply a maintainer-generated optimization result |

## Sources & Priority

| Source | Priority | Description |
|--------|----------|-------------|
| local | 1 (highest) | Your custom artifacts in `~/.omc-manage/local/` |
| oh-my-claudecode | 2 | Multi-agent orchestration framework |
| superpowers | 3 | Engineering process guardrails (TDD, debugging, etc.) |

Local artifacts always win conflicts. Add your own skills:

```bash
mkdir -p ~/.omc-manage/local/skills/my-skill
# Create SKILL.md with frontmatter
omc-manage setup --force
```

Add a remote guidelines source:

```bash
omc-manage source add karpathy https://github.com/forrestchang/andrej-karpathy-skills.git \
  --artifacts guidelines \
  --mapping guidelines=CLAUDE.md \
  --role guidelines
omc-manage source sync karpathy
omc-manage setup --type guidelines
```

## Maintainer Guideline Optimization

OMC now treats runtime prompt guidance as a first-class `guidelines` artifact,
but the semantic optimization workflow is maintainer-only. The optimizer does
not get installed into user Claude Code configs.

Build an optimization pack for model-assisted synthesis:

```bash
omc-manage guidelines optimize
```

This writes maintainer artifacts under `.omc/guidelines/`, including:

- `latest/next-steps.md`
- `latest/optimizer-input.md`
- `latest/sections.json`
- `latest/sources.json`
- `latest/current-local-guidelines.md`

If you are driving the repo with Claude Code CLI or Codex, read
`latest/next-steps.md` first. That file points the agent at the relevant
maintainer workflow and the runtime file to edit.

The repository-only maintainer prompt lives at
`.maintainer/skills/guideline-optimizer/SKILL.md`. It is intentionally not
installed into user runtime configs.

After the optimization pass updates `.local/guidelines/CLAUDE.md`, reinstall
with:

```bash
omc-manage guidelines apply --result-file /absolute/path/to/result.json
omc-manage setup --type guidelines
```

## Update Upstream

```bash
omc-manage source sync     # Fetch latest from all upstream repos
omc-manage setup --force   # Reinstall with updated artifacts
```

## Conflict Resolution

When the same artifact exists in multiple sources:

1. **User preferences** — explicit `artifact prefer` overrides
2. **SemVer** — highest version wins
3. **Local priority** — local always wins
4. **Source priority** — lower priority number wins

## License

MIT
