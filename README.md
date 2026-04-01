# claudecode-omc

Multi-source Claude Code skill manager for [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode).

Manages skills from two sources — **local** (custom skills maintained in this project) and **upstream** (oh-my-claudecode) — with conflict detection, quality-based resolution, and configurable installation.

## Quick Start

```bash
# Sync upstream skills
omc-manage source sync --upstream

# Install merged skills to ~/.claude/skills/
omc-manage setup --scope user

# Or install to current project only
omc-manage setup --scope project
```

## Commands

| Command | Description |
|---------|-------------|
| `omc-manage setup [--scope user\|project] [--force] [--dry-run]` | Install merged skills |
| `omc-manage doctor` | Health checks |
| `omc-manage source list` | Show configured sources |
| `omc-manage source sync [--upstream\|--all]` | Fetch upstream skills |
| `omc-manage source status` | Sync status and history |
| `omc-manage skill list [--verbose]` | List merged skills with source attribution |
| `omc-manage skill prefer <name> <source>` | Set per-skill source preference |
| `omc-manage skill conflicts` | Show conflict report |

## Sources

| Source | Priority | Description |
|--------|----------|-------------|
| local | 1 (highest) | Custom skills in `.local/skills/`, maintained in this repo |
| upstream | 2 | `Yeachan-Heo/oh-my-claudecode` |

## Conflict Resolution

When the same skill exists in both sources, conflicts are resolved using a 4-tier strategy:

1. **User preferences** — explicit `skill prefer` overrides
2. **SemVer** — highest version wins (if both have version metadata)
3. **Local priority** — local skills win ties (quality-scored)
4. **Namespace** — keep both with source prefixes (if enabled)

## Configuration

- Source config: `~/.omc-manage/sources.json`
- Merge preferences: `templates/merge-config.json`
- Local skills: `.local/skills/` (tracked in git)
- Upstream skills snapshot: `.upstream/skills/` (gitignored, populated on sync)

## License

MIT
