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

All artifacts are installed to `~/.claude/` where Claude Code discovers them automatically.

## Commands

| Command | Description |
|---------|-------------|
| `omc-manage setup [--force] [--dry-run] [--type <type>]` | Install merged artifacts |
| `omc-manage doctor` | Health checks |
| `omc-manage source list` | Show configured sources |
| `omc-manage source sync` | Update upstream sources to latest |
| `omc-manage source add <name> <url>` | Add a new source |
| `omc-manage artifact list [--type <type>]` | List merged artifacts |
| `omc-manage artifact conflicts [--type <type>]` | Show conflict report |

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
