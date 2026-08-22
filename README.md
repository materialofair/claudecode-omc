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
| Skills | ~70 | oh-my-claudecode + superpowers + iOS/SwiftUI pack |
| Agents | ~19 | oh-my-claudecode + superpowers |
| Hooks | ~8 | oh-my-claudecode (standalone) |
| Commands | ~3 | superpowers |
| Guidelines | 1 | local coding discipline prompt guidelines |

All artifacts are installed to `~/.claude/` where Claude Code discovers them automatically.
Adding a curated subset of [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
on top can take totals to ~102 skills / ~35 agents / ~26 commands — see
[Distribution-Repo Sources](#distribution-repo-sources) below.

The bundled guidelines install into `~/.claude/CLAUDE.md` and add lightweight
coding discipline rules
adapted from [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills):
think before coding, prefer simple solutions, make surgical changes, and verify
completion with concrete evidence.

### 🆕 iOS/SwiftUI Skills Pack (v5.6.8)

The latest release includes 8 specialized iOS/SwiftUI skills from MIT-licensed sources:

| Skill | Author | Purpose |
|-------|--------|---------|
| `swiftui-expert-skill` | [AvdLee](https://github.com/AvdLee) | Comprehensive SwiftUI patterns, accessibility, animations |
| `swiftui-pro` | [twostraws](https://github.com/twostraws) | Professional SwiftUI development best practices |
| `ios-debugger-agent` | [Dimillian](https://github.com/Dimillian) | Advanced iOS debugging and troubleshooting |
| `swift-concurrency-expert` | [Dimillian](https://github.com/Dimillian) | Swift concurrency, async/await patterns |
| `swiftui-liquid-glass` | [Dimillian](https://github.com/Dimillian) | Modern liquid glass UI effects |
| `swiftui-performance-audit` | [Dimillian](https://github.com/Dimillian) | Performance profiling and optimization |
| `swiftui-ui-patterns` | [Dimillian](https://github.com/Dimillian) | Common UI patterns and components |
| `swiftui-view-refactor` | [Dimillian](https://github.com/Dimillian) | View architecture and refactoring |

All skills include comprehensive reference materials and follow ECC standards for seamless integration.

## Commands

| Command | Description |
|---------|-------------|
| `omc-manage setup [--force] [--dry-run] [--type <type>] [--source <name>]` | Install merged artifacts |
| `omc-manage doctor` | Health checks; reports each source's `kind`, `profile`, and `allowlist`, and flags `staged` distribution sources awaiting `plan apply` |
| `omc-manage source list` | Show configured sources |
| `omc-manage source sync [<name>] [--frozen]` | Update upstream sources to latest, or (`--frozen`) to the commits pinned in `.omc-curation/sources.lock.json` |
| `omc-manage source lock [<name>]` | Pin sources to their currently-synced upstream commit for reproducible installs |
| `omc-manage source drift [<name>] [--json]` | Detect local edits / upstream changes vs the per-file hashes recorded at sync (exits non-zero on drift) |
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
| ecc | 4 | yes | [everything-claude-code](https://github.com/affaan-m/everything-claude-code) distribution; ships a curated subset via `.omc-curation/ecc-selection.json` (not all 251 skills) |
| impeccable | 5 | yes | [impeccable](https://github.com/pbakaus/impeccable) design skill (frontend UI design/critique/polish with 23 commands) plus its companion agent |
| your own | 6+ | opt-in | Distribution-style repos added via `source add --kind distribution-repo` |

### Governance manifest

`.omc-curation/governance.json` is the single authoritative manifest for
cross-source policy — per-source **priority**, per-source install **allowlist**,
content **patches**, and **conflict** resolution (`preferences`, `exclude`) — in
one place:

```json
{
  "sources": {
    "local":            { "priority": 1 },
    "ecc": {
      "priority": 4,
      "allowlist": { "skills": ["…"], "agents": ["…"] },
      "patches": {
        "agents/swift-reviewer": {
          "frontmatter": { "model": "glm-5.2" },
          "replace": [{ "find": "MUST BE USED for Swift", "with": "Use for Swift" }],
          "append": "\n## Project note\nFollow our SwiftLint config.\n"
        }
      }
    },
    "anthropic-skills": { "priority": 99 }
  },
  "conflict": { "preferences": {}, "exclude": { "skills": ["ask", "ccg"] } }
}
```

**Content patches** edit a winning artifact's content as it installs, without
forking the whole file: `frontmatter` (override scalar YAML keys like `model`/
`description`), `replace` (literal body find→replace; a missing target warns,
never crashes), and `prepend`/`append` (body text). Keyed by `<type>/<name>`
(a skill patch targets its `SKILL.md`). Remove the patch and re-run `setup` to
revert.

> **Experimental — not load-bearing.** `source drift`, `source lock` /
> `--frozen`, and content `patches` solve *potential* rather than currently
> validated needs (the bundled snapshot already pins content for reproducibility,
> and `sync` overwrites local edits regardless of drift). They are isolated and
> opt-in; the core value is multi-source merge + per-source curation + bundling.
> Don't wire `source drift` into CI as an integrity gate expecting strong
> guarantees.

It supersedes the legacy `templates/merge-config.json` (still read as a fallback
when `governance.json` declares no `conflict` block).

**Allowlist authority order** (highest first): an explicit allowlist written by
`omc-manage plan apply <source>` → `governance.json`'s inline `allowlist` →
`.omc-curation/<source>-selection.json` → none (install everything). So any
source — not just ECC — can be curated either inline in `governance.json` or in
its own `<source>-selection.json`; `ecc-selection.json` is just the first
instance of that per-source mechanism.

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

## OpenCode harness

`omc-manage setup` can install the same curated artifacts for
[OpenCode](https://opencode.ai) instead of Claude Code by passing
`--harness opencode`:

```bash
omc-manage setup --harness opencode                # user scope (~/.config/opencode)
omc-manage setup --harness opencode --scope project # project scope (.opencode/, opencode.json)
```

Mapping at install time:

| Claude Code | OpenCode |
|-------------|----------|
| `~/.claude/skills/` | `~/.config/opencode/skills/` |
| `~/.claude/agents/*.md` | `~/.config/opencode/agents/*.md` (frontmatter adapted) |
| `~/.claude/commands/*.md` | `~/.config/opencode/commands/*.md` (frontmatter adapted) |
| `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` |
| `~/.claude/settings.json` | `~/.config/opencode/opencode.json` (`mcpServers` → `mcp`) |
| `~/.claude/hooks/` | *skipped* — OpenCode uses plugins, not Claude hooks |
| `~/.claude/hud/` | *skipped* — OpenCode theming lives in `tui.json` |

### GLM-5.2+ model config

The shipped `.local/settings/opencode.json` declares a `zhipu` provider
(BigModel's OpenAI-compatible endpoint) with `glm-5.2` and `glm-5.3` and sets
`zhipu/glm-5.2` as the default model. It is merged into the generated
`opencode.json` and reads the API key from the `ZHIPU_API_KEY` environment
variable:

```bash
export ZHIPU_API_KEY=...              # https://open.bigmodel.cn
omc-manage setup --harness opencode   # then run `opencode` and pick a GLM model
```

GLM Coding Plan (套餐) users should switch `baseURL` to
`https://open.bigmodel.cn/api/coding/paas/v4` in `.local/settings/opencode.json`.

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
