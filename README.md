# claudecode-omc

Claude Code harness — curated best-practice configurations from multiple sources.

Merges skills, agents, hooks, and commands from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) and [superpowers](https://github.com/obra/superpowers) with your own local customizations, using priority-based conflict resolution.

## Install

```bash
npm install -g claudecode-omc
omc-manage setup
```

## What Gets Installed

Defaults (only the bundled sources, no extras):

| Artifact | Count | Sources |
|----------|-------|---------|
| Skills | ~62 | oh-my-claudecode + superpowers |
| Agents | ~19 | oh-my-claudecode + superpowers |
| Hooks | ~8 | oh-my-claudecode (standalone) |
| Commands | ~3 | superpowers |
| Guidelines | 1 | local coding discipline prompt guidelines |

All artifacts are installed to `~/.claude/` where Claude Code discovers them automatically.
Adding a curated subset of [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
on top can take totals to ~94 skills / ~35 agents / ~26 commands — see
[Distribution-Repo Sources](#distribution-repo-sources) below.

The bundled guidelines install into `~/.claude/CLAUDE.md` and add lightweight
coding discipline rules
adapted from [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills):
think before coding, prefer simple solutions, make surgical changes, and verify
completion with concrete evidence.

## Commands

| Command | Description |
|---------|-------------|
| `omc-manage setup [--force] [--dry-run] [--type <type>] [--source <name>]` | Install merged artifacts |
| `omc-manage doctor` | Health checks; reports each source's `kind`, `profile`, and `allowlist`, and flags `staged` distribution sources awaiting `plan apply` |
| `omc-manage source list` | Show configured sources |
| `omc-manage source sync [<name>]` | Update upstream sources to latest |
| `omc-manage source add <name> <url> [--kind ...] [--artifacts ...] [--manifests ...] [--profiles ...]` | Add a new source, including `guidelines` and `distribution-repo` sources |
| `omc-manage source remove <name>` | Remove a registered source |
| `omc-manage source inspect <name>` | Inspect a source as a bundle/catalog instead of only as flat artifacts |
| `omc-manage plan install <source> --profile <name>` | Build a profile-driven install plan for a source |
| `omc-manage plan apply <source> --profile <name> [--selection-file <path>]` | Materialize a reviewed plan into source activation state, optionally curating an item-level allowlist |
| `omc-manage artifact list [--type <type>]` | List merged artifacts |
| `omc-manage artifact conflicts [--type <type>]` | Show conflict report |
| `omc-manage guidelines optimize [source...]` | Build maintainer-only guideline optimization artifacts |
| `omc-manage guidelines apply --result-file <path>` | Apply a maintainer-generated optimization result |

## Sources & Priority

| Source | Priority | Default? | Description |
|--------|----------|----------|-------------|
| local | 1 (highest) | yes | Your custom artifacts in `~/.omc-manage/local/` |
| oh-my-claudecode | 2 | yes | Multi-agent orchestration framework |
| superpowers | 3 | yes | Engineering process guardrails (TDD, debugging, etc.) |
| ecc / your own | 4+ | opt-in | Distribution-style repos added via `source add --kind distribution-repo` |

Local artifacts always win conflicts. Sources added via `source add` are
appended at the next free priority. Add your own skills:

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

<a id="distribution-repo-sources"></a>
### Distribution-Repo Sources

Distribution repos (e.g. [everything-claude-code](https://github.com/affaan-m/everything-claude-code))
publish multiple harness surfaces, manifests, and reference material alongside
installable Claude artifacts. OMC absorbs them in four stages so you can pick
exactly what reaches `~/.claude/`:

```bash
# 1. Register — sync the full repo into project metadata, install nothing yet.
omc-manage source add ecc https://github.com/affaan-m/everything-claude-code.git \
  --artifacts skills,agents,hooks,commands \
  --kind distribution-repo \
  --install-mode planned \
  --harnesses claude,codex,cursor,gemini,opencode \
  --manifests package.json,.claude-plugin/plugin.json,agent.yaml \
  --profiles claude-runtime,reference-only

# 2. Sync — clones into .upstream/<source>/ and reads declared manifests.
omc-manage source sync ecc

# 3. Inspect — normalized catalog of runtime / harness / reference surfaces.
omc-manage source inspect ecc

# 4. Plan — preview what a profile would activate.
omc-manage plan install ecc --profile claude-runtime
```

At this point nothing has been installed. `doctor` shows the source as
`staged, run "omc-manage plan apply <name>"` so you don't lose track of it.

To activate, choose one of:

```bash
# All runtime artifacts the profile selected (no item-level curation):
omc-manage plan apply ecc --profile claude-runtime

# Reference-only — keep the repo synced locally, install nothing:
omc-manage plan apply ecc --profile reference-only

# Curated subset via selection file (recommended for large repos):
omc-manage plan apply ecc \
  --profile claude-runtime \
  --selection-file /absolute/path/to/selection.json
```

A selection file is a per-artifact-type allowlist:

```json
{
  "skills": ["agent-eval", "santa-method", "prompt-optimizer"],
  "agents": ["harness-optimizer", "opensource-sanitizer"],
  "commands": ["prp-prd", "prp-plan", "harness-audit"]
}
```

When the synced source exposes an item directory, OMC validates the names
against the catalog; for manifest-only surfaces it accepts the allowlist with a
warning and the real filtering happens in `setup` against on-disk content. The
allowlist becomes part of the source config in `~/.omc-manage/sources.json` and
is enforced on every subsequent `omc-manage setup`.

After `plan apply`, finalize with:

```bash
omc-manage setup --dry-run --source ecc   # confirm scope
omc-manage setup --source ecc             # install only this source
omc-manage doctor                         # verify allowlist counts
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

## Source Kinds

OMC distinguishes two source shapes:

- `content-repo` — already shaped like OMC artifact directories (`skills/`,
  `agents/`, etc.); installed as-is.
- `distribution-repo` — publishes multiple harness surfaces, manifests, and
  reference material; defaults to `installMode=planned` so ordinary `setup`
  and `artifact list` flows do not absorb it automatically. Activate it
  through the [Distribution-Repo Sources](#distribution-repo-sources) flow.

## License

MIT
