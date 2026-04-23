# Repository AGENTS

These instructions apply to the entire repository.

## Guideline Maintenance Workflow

When a task involves any of the following:

- `.local/guidelines/CLAUDE.md`
- `src/guidelines/`
- `src/cli/guidelines.js`
- runtime prompt guidance
- external guideline repos such as `andrej-karpathy-skills`
- semantic deduplication or merging of prompt rules

use the maintainer workflow instead of editing the runtime guideline file blindly.

### Required sequence

1. Run:

```bash
node bin/omc-manage.js guidelines optimize
```

2. Read:

- `.omc/guidelines/latest/next-steps.md`
- `.omc/guidelines/latest/optimizer-input.md`
- `.maintainer/skills/guideline-optimizer/SKILL.md`

3. Make runtime edits only in:

```text
.local/guidelines/CLAUDE.md
```

4. Verify:

```bash
node bin/omc-manage.js setup --dry-run --type guidelines
node bin/omc-manage.js artifact list --type guidelines
```

## Boundary Rules

- Do not place maintainer-only optimizer prompts under `.local/skills/`.
- Do not install maintainer-only workflow files into end-user `~/.claude` runtime config.
- Treat `.maintainer/` and `.omc/guidelines/` as maintainer surfaces.
- Treat `.local/guidelines/CLAUDE.md` as the shipping runtime artifact.
