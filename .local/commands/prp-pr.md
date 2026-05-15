---
description: "Create a PR/MR from current branch with unpushed commits (PRP-aware) — auto-detects GitHub vs GitLab (github.com / code.iflytek.com / generic GitLab)"
argument-hint: "[base-branch] (default: main)"
---

# Create Pull Request / Merge Request (PRP variant)

> Local override of upstream `ecc/commands/prp-pr.md`. Adds GitLab (incl. self-hosted
> `code.iflytek.com`) support. Do not edit the upstream file — keep changes here.
> Difference vs `/pr`: this variant references PRP artifacts (`.claude/PRPs/...`) and
> suggests `/prp-commit` for staging.

**Input**: `$ARGUMENTS` — optional, may contain a base branch name and/or flags (e.g., `--draft`).

**Parse `$ARGUMENTS`**:
- Extract any recognized flags (`--draft`)
- Treat remaining non-flag text as the base branch name
- Default base branch to `main` if none specified

---

## Phase 0 — DETECT PLATFORM

```bash
remote_url=$(git remote get-url origin 2>/dev/null)

case "$remote_url" in
  *github.com*)
    platform=github; cli=gh ;;
  *code.iflytek.com*)
    platform=gitlab; cli=glab; gitlab_host=code.iflytek.com ;;
  *gitlab*)
    platform=gitlab; cli=glab
    gitlab_host=$(echo "$remote_url" | sed -E 's#.*[@/]([^:/]+)[:/].*#\1#') ;;
  *)
    platform=unknown ;;
esac
```

If `platform=unknown`: ask the user to confirm platform or fix `origin`.

Auth check:
- `github` → `gh auth status`
- `gitlab` → `glab auth status --hostname "$gitlab_host"`

For `code.iflytek.com` one-time login:
```bash
glab auth login --hostname code.iflytek.com
# HTTPS + Personal Access Token (scope: api, read_repository, write_repository)
# Token: https://code.iflytek.com/-/user_settings/personal_access_tokens
```

---

## Phase 1 — VALIDATE

```bash
git branch --show-current
git status --short
git log origin/<base>..HEAD --oneline
```

| Check | Condition | Action if Failed |
|---|---|---|
| Not on base branch | Current branch ≠ base | Stop: "Switch to a feature branch first." |
| Clean working directory | No uncommitted changes | Warn: "You have uncommitted changes. Commit or stash first. Use `/prp-commit` to commit." |
| Has commits ahead | `git log origin/<base>..HEAD` not empty | Stop: "No commits ahead of `<base>`. Nothing to PR." |
| No existing PR/MR | See platform-specific check below | Stop: "PR/MR already exists: #<number>." |

**Existing PR/MR check:**

| Platform | Command |
|---|---|
| GitHub | `gh pr list --head <branch> --json number,url --jq '.[0]'` |
| GitLab | `glab mr list --source-branch <branch> --output json --per-page 1 \| jq '.[0]'` |

If all checks pass, proceed.

---

## Phase 2 — DISCOVER

### PR/MR Template

**GitHub** (PR templates):
1. `.github/PULL_REQUEST_TEMPLATE/` directory — list and let user choose
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `.github/pull_request_template.md`
4. `docs/pull_request_template.md`

**GitLab** (MR templates):
1. `.gitlab/merge_request_templates/` directory — list and let user choose
2. `.gitlab/merge_request_template.md`

If found, use its structure.

### Commit Analysis

```bash
git log origin/<base>..HEAD --format="%h %s" --reverse
```

- **Title**: Conventional commit format. Multiple types → dominant one. Single commit → use as-is.
- **Summary**: Group commits by type/area.

### File Analysis

```bash
git diff origin/<base>..HEAD --stat
git diff origin/<base>..HEAD --name-only
```

Categorize: source, tests, docs, config, migrations.

### PRP Artifacts

Check for related PRP artifacts:
- `.claude/PRPs/reports/` — Implementation reports
- `.claude/PRPs/plans/` — Plans that were executed
- `.claude/PRPs/prds/` — Related PRDs

Reference these in the body if they exist.

---

## Phase 3 — PUSH

```bash
git push -u origin HEAD
```

If push fails due to divergence:
```bash
git fetch origin
git rebase origin/<base>
git push -u origin HEAD  # use --force-with-lease only after rebase
```

If rebase conflicts, stop and inform the user.

---

## Phase 4 — CREATE

### With Template

Fill each section using commit and file analysis. Preserve all sections — leave as "N/A" if not applicable.

### Without Template

```markdown
## Summary
<1-2 sentence description>

## Changes
<bulleted list grouped by area>

## Files Changed
<list with change type: Added/Modified/Deleted>

## Testing
<how changes were tested, or "Needs testing">

## Related Issues
<linked issues with Closes/Fixes/Relates to #N, or "None">
```

### Create the PR/MR

**GitHub:**
```bash
gh pr create \
  --title "<title>" \
  --base <base-branch> \
  --body "<body>"
  # Add --draft if --draft was parsed
```

**GitLab:**
```bash
glab mr create \
  --title "<title>" \
  --target-branch <base-branch> \
  --description "<body>" \
  --source-branch "$(git branch --show-current)" \
  --yes
  # Add --draft if --draft was parsed
```

---

## Phase 5 — VERIFY

**GitHub:**
```bash
gh pr view --json number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles
gh pr checks --json name,status,conclusion 2>/dev/null || true
```

**GitLab:**
```bash
glab mr view --output json
glab ci status 2>/dev/null || true
```

---

## Phase 6 — OUTPUT

```
<PR|MR> #<number>: <title>
Platform: <github|gitlab(host)>
URL: <url>
Branch: <head> → <base>
Changes: +<additions> -<deletions> across <changedFiles> files

CI Checks: <status summary or "pending" or "none configured">

Artifacts referenced:
  - <any PRP reports/plans linked in body>

Next steps:
  GitHub:
    - gh pr view <N> --web        → open in browser
    - /code-review <N>            → review the PR
    - gh pr merge <N>             → merge when ready
  GitLab:
    - glab mr view <N> --web      → open in browser
    - /code-review <N>            → review the MR
    - glab mr merge <N>           → merge when ready
```

(Print only the section matching the detected platform.)

---

## Edge Cases

- **No `gh`/`glab`**: Stop with install + auth instructions for the detected platform.
- **Not authenticated**: Stop with `gh auth login` or `glab auth login --hostname <host>`.
- **Force push needed**: After rebase, use `git push --force-with-lease` (never `--force`).
- **Multiple templates**: List and ask user to choose.
- **Large PR/MR (>20 files)**: Warn about scope. Suggest splitting if logically separable.
- **Unknown platform**: Ask user to confirm or fix `origin`.
