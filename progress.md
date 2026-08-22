# Progress

## Session Log

- Captured repo state and confirmed dirty files: `package.json`, `src/cli/setup.js`.
- Compared OMC source/install model with ECC distribution structure.
- Identified the minimal viable vNext as:
  - bundle-aware source schema
  - manifest discovery
  - normalized catalog
  - profile-driven planning CLI
- Implemented:
  - `source inspect`
  - `plan install`
  - source metadata sync for manifest files
  - normalized catalog generation for distribution repos
- Validated with a temporary `ecc-temp` source pointing at `everything-claude-code`.
- Now implementing `plan apply` so reviewed plans can change source activation
  state instead of staying advisory only.
- Validated `plan apply` end to end with `ecc-temp`:
  - `planned -> auto` for `claude-runtime`
  - source enters `setup --dry-run`
  - `auto -> planned + reference` for `reference-only`
  - source drops back out of `setup --dry-run`
- Now extending the same path with source-level item allowlists so a reviewed
  plan can activate only named skills/agents/commands/hooks from a distribution
  source.

## Next

- Validate `--selection-file` with a real distribution source and keep the
  resulting source state auditable.

## 2026-04-27 architecture review

- Ran full ingestion of `everything-claude-code` (`source add` →
  `source sync` → `source inspect` → `plan install` → `plan apply` →
  `setup --dry-run`). 182 skills, 48 agents, 79 commands flowed through.
- Caught and fixed three bugs:
  1. content-repo `reference-only → claude-runtime` round-trip (catalog
     `installable` semantics + `deriveSourceActivation` artifact preservation).
  2. `--selection-file` validation rejected manifest-driven names with no
     fallback, killing curation for distribution-repos.
  3. `doctor` skipped distribution sources entirely, hiding their state from
     the user.
- All three fixes are minimal and local. No public CLI surface changed.

## 2026-04-27 real ECC adoption

- ECC registered (priority 4) and synced into `.upstream/ecc/`.
- Curated allowlist saved to `.omc-curation/ecc-selection.json`: 31 skills +
  16 agents + 23 commands (≈70 ECC-unique meta-tooling items; language-
  specific patterns and domain verticals excluded; OMC-internal collisions
  prevented).
- `plan apply ecc --profile claude-runtime --selection-file …` recorded
  allowlist; `setup` materialised it.
- `repo-scan` deferred (CRLF SKILL.md, frontmatter regex `^---\n…\n---`
  only matches LF — pre-existing parser issue, out of scope).

## Pre-existing setup install bug (uncovered by real ECC adoption)

- `src/cli/setup.js` single-file branch wrote destination as `item.name`,
  but the loaders (`agent-merger`, `command-merger`) strip `.md` from
  `name` for allowlist matching. So every user-global agent and command
  landed without an extension — Claude Code's `*.md` loader was silently
  ignoring **all** OMC-managed agents/commands (not only ECC ones).
- Fix: in the single-file write, re-attach the source file's extension on
  disk; do not change `name` semantics used for matching.
- Verified in this session: 16/16 curated ECC agents and 23/23 commands
  now show up with frontmatter descriptions in Claude Code's reload, and
  OMC's own `analyst` / `architect` / `code-reviewer` are also functional
  for the first time.
