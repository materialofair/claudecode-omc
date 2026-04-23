---
name: guideline-optimizer
description: Maintainer-only workflow for semantically optimizing OMC guideline sources into a concise canonical .local/guidelines/CLAUDE.md output. Use when curating external prompt-guideline repos such as andrej-karpathy-skills.
---

# Guideline Optimizer

This skill is for OMC maintainers. It does not ship to end-user Claude Code
configurations and must not be installed into `~/.claude/skills`.

## Goal

Take multiple guideline sources, use model judgment to deduplicate and merge
them semantically, and produce a high-signal canonical runtime guideline file
at `.local/guidelines/CLAUDE.md`.

## Workflow

1. Build the optimization pack:

```bash
node bin/omc-manage.js guidelines optimize
```

Optional: scope to specific sources.

```bash
node bin/omc-manage.js guidelines optimize karpathy local
```

2. Read the generated maintainer artifacts:

- `.omc/guidelines/latest/optimizer-input.md`
- `.omc/guidelines/latest/sections.json`
- `.omc/guidelines/latest/sources.json`
- `.omc/guidelines/latest/current-local-guidelines.md`

3. Perform semantic synthesis with the model:

- collapse semantically overlapping rules
- keep stronger operational wording when one rule subsumes another
- rewrite combined rules instead of stacking similar text
- surface real conflicts explicitly

4. Write the improved runtime output to:

```json
{
  "version": 1,
  "generatedBy": "claude-code | codex | other",
  "summary": "what changed",
  "runtimeGuidelinesMarkdown": "# Coding Discipline\n...",
  "decisions": [
    {
      "action": "keep | merge | rewrite | drop",
      "sourceSectionIds": ["local:2"],
      "title": "Think Before Coding",
      "rationale": "why this rule stayed or changed"
    }
  ],
  "conflicts": []
}
```

5. Apply the result:

```bash
node bin/omc-manage.js guidelines apply --result-file /absolute/path/to/result.json
```

This command writes:

- `.local/guidelines/CLAUDE.md`
- `.omc/guidelines/latest/result.json`
- `.omc/guidelines/latest/decision-log.md`

6. Verify the runtime install path still works:

```bash
node bin/omc-manage.js setup --dry-run --type guidelines
node bin/omc-manage.js setup --type guidelines
```

## Output Contract

- final runtime markdown only in `.local/guidelines/CLAUDE.md`
- no optimizer notes in the runtime file
- rationale and audit trail stay under `.omc/guidelines/`

## Rules

- Do not add this skill under `.local/skills/`
- Do not install optimizer artifacts into user `~/.claude` runtime config
- Keep the runtime guidelines concise enough for always-on usage
- Prefer semantic merging over text-level dedupe
