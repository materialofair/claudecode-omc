# Task Plan — Skill Index Cache Infrastructure

## Goal

Replace the hardcoded alias table in `prompt-optimizer/SKILL.md` Phase 0.5 with a
real-time index of locally installed skills. Generate `~/.claude/skills/_index.md`
at `omc-manage setup` time so prompt-optimizer (and any future skill) can grep
candidates by intent without enumerating 96+ files at runtime.

## Non-goals

- No agents/commands/hooks index — only skills (scope creep risk)
- No watch mode / auto-regen on file change — only at setup time
- No JSON schema / structured catalog — markdown index is enough for LLM consumption

## Phases

### Phase 1 — Index generator module
- New file: `src/cli/skill-index.js`
  - `buildIndex(skillsDir)`: scan `<dir>/*/SKILL.md`, parse YAML frontmatter,
    extract `name` + `description`
  - `writeIndex(skillsDir, entries)`: write `<dir>/_index.md` with table
- New CLI command: `omc-manage skill index [--scope user|project]`

### Phase 2 — Auto-hook into setup
- In `src/cli/setup.js`, after skills install completes, call `buildIndex`
- Guarded by: only when scope=user, not --dry-run
- Failure non-fatal: log warning, continue

### Phase 3 — Help text
- Update `omc-manage help` to list `skill index`

### Phase 4 — Prompt-optimizer Phase 0.5 upgrade
- Replace preamble: "cat ~/.claude/skills/_index.md before recommending"
- Keep alias table as fallback (bootstrap case)

### Phase 5 — Release 5.6.5
- Bundle, commit feat + chore, tag, npm publish, push
- Verify locally after global install

## Decisions

- **Location**: `~/.claude/skills/_index.md` (underscore avoids skill discovery)
- **Format**: Markdown table (cheaper for LLM than JSON, grep-friendly)
- **No watch mode**: setup is the only mutation point that matters
- **Only skills**: scope discipline; extend to agents/commands later if proven

## Files to touch

| File | Action |
|---|---|
| `src/cli/skill-index.js` | NEW |
| `src/cli/skill.js` | EDIT — add `index` route |
| `src/cli/setup.js` | EDIT — post-install hook |
| `src/cli/index.js` | EDIT — help text |
| `.local/skills/prompt-optimizer/SKILL.md` | EDIT — Phase 0.5 preamble |
| `package.json` | EDIT — 5.6.4 → 5.6.5 |

## Verification

1. `omc-manage skill index --scope user` produces `~/.claude/skills/_index.md`
2. Index contains 95+ entries
3. `grep -i "tdd" ~/.claude/skills/_index.md` returns relevant rows
4. `omc-manage setup --scope user --type skills` regenerates index automatically
5. Idempotent regen (stale entries removed when skill deleted)

## Errors / Pitfalls

- (filled as work proceeds)
