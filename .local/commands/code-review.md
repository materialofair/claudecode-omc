---
description: Code review — local uncommitted changes, GitHub PR, or GitLab MR (auto-detects platform from git remote; supports github.com and code.iflytek.com)
argument-hint: [pr-number | mr-number | url | blank for local review]
---

# Code Review

> Local override of upstream `ecc/commands/code-review.md`.
> Adds GitLab support (including self-hosted `code.iflytek.com`) on top of the
> original GitHub PR flow. Do not edit the upstream file — keep changes here.

**Input**: $ARGUMENTS

---

## Mode Selection

If `$ARGUMENTS` contains a number, URL, or `--pr` / `--mr`:
→ Jump to **Remote Review Mode** (auto-detects GitHub vs GitLab).

Otherwise:
→ Use **Local Review Mode**.

---

## Local Review Mode

Comprehensive security and quality review of uncommitted changes. Platform-agnostic.

### Phase 1 — GATHER

```bash
git diff --name-only HEAD
```

If no changed files, stop: "Nothing to review."

### Phase 2 — REVIEW

Read each changed file in full. Check for:

**Security Issues (CRITICAL):**
- Hardcoded credentials, API keys, tokens
- SQL injection vulnerabilities
- XSS vulnerabilities
- Missing input validation
- Insecure dependencies
- Path traversal risks

**Code Quality (HIGH):**
- Functions > 50 lines
- Files > 800 lines
- Nesting depth > 4 levels
- Missing error handling
- console.log statements
- TODO/FIXME comments
- Missing JSDoc for public APIs

**Best Practices (MEDIUM):**
- Mutation patterns (use immutable instead)
- Emoji usage in code/comments
- Missing tests for new code
- Accessibility issues (a11y)

### Phase 3 — REPORT

Generate report with:
- Severity: CRITICAL, HIGH, MEDIUM, LOW
- File location and line numbers
- Issue description
- Suggested fix

Block commit if CRITICAL or HIGH issues found.
Never approve code with security vulnerabilities.

---

## Remote Review Mode

Comprehensive PR/MR review — fetches diff, reads full files, runs validation, posts review.

### Phase 0 — DETECT PLATFORM

Run this first, before anything else:

```bash
remote_url=$(git remote get-url origin 2>/dev/null)

case "$remote_url" in
  *github.com*)
    platform=github
    cli=gh
    ;;
  *code.iflytek.com*)
    platform=gitlab
    cli=glab
    gitlab_host=code.iflytek.com
    ;;
  *gitlab*)
    platform=gitlab
    cli=glab
    # Generic GitLab — extract host
    gitlab_host=$(echo "$remote_url" | sed -E 's#.*[@/]([^:/]+)[:/].*#\1#')
    ;;
  *)
    platform=unknown
    ;;
esac
```

If `platform=unknown`: stop and ask the user which platform to use, or to set the origin remote.

**Tooling preconditions:**
- `github` → require `gh` CLI authenticated (`gh auth status`)
- `gitlab` → require `glab` CLI authenticated against the right host
  (`glab auth status --hostname "$gitlab_host"`)

For `code.iflytek.com`, the one-time setup is:
```bash
glab auth login --hostname code.iflytek.com
# Protocol: HTTPS
# Authentication: Personal Access Token
# Token from https://code.iflytek.com/-/user_settings/personal_access_tokens
# Required scopes: api, read_repository
```

> If the company GitLab needs VPN/proxy, surface that to the user before proceeding.

### Phase 1 — FETCH

Parse input to determine the PR/MR number:

| Input | Action |
|---|---|
| Number (e.g. `42`) | Use as PR/MR number |
| GitHub URL (`github.com/.../pull/42`) | Extract number |
| GitLab URL (`code.iflytek.com/.../merge_requests/42`) | Extract number |
| Branch name | Find via `gh pr list --head <branch>` or `glab mr list --source-branch <branch>` |

**GitHub:**
```bash
gh pr view <N> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <N>
```

**GitLab (glab):**
```bash
glab mr view <N>
glab mr diff <N>
# Or via API for richer metadata:
glab api "projects/:fullpath/merge_requests/<N>" \
  --hostname "$gitlab_host"
```

`:fullpath` is the URL-encoded project path. `glab` resolves it from the current repo's origin automatically; pass `-R OWNER/REPO` only when running outside the repo.

If PR/MR not found, stop with error. Store metadata for later phases.

### Phase 2 — CONTEXT

Build review context (platform-agnostic):

1. **Project rules** — Read `CLAUDE.md`, `.claude/docs/`, and any contributing guidelines
2. **Planning artifacts** — Check `.claude/prds/`, `.claude/plans/`, `.claude/reviews/`, and legacy `.claude/PRPs/{prds,plans,reports,reviews}/`
3. **PR/MR intent** — Parse description for goals, linked issues, test plans
4. **Changed files** — List all modified files and categorize by type (source, test, config, docs)

### Phase 3 — REVIEW

Read each changed file **in full** (not just the diff hunks).

Fetch full file contents at the PR/MR head revision:

**GitHub:**
```bash
gh pr diff <N> --name-only | while IFS= read -r file; do
  gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d
done
```

**GitLab:**
```bash
# List changed files
glab mr diff <N> --raw | grep -E '^(\+\+\+|---) ' | awk '{print $2}' | sed 's#^[ab]/##' | sort -u

# Fetch each file at MR head SHA
head_sha=$(glab mr view <N> --output json | jq -r '.diff_refs.head_sha // .sha')
project_path=$(git remote get-url origin | sed -E 's#.*[:/]([^/]+/[^/]+)\.git$#\1#')
encoded_path=$(printf '%s' "$project_path" | sed 's#/#%2F#g')

# For each file:
encoded_file=$(printf '%s' "$file" | sed 's#/#%2F#g')
glab api "projects/$encoded_path/repository/files/$encoded_file/raw?ref=$head_sha" \
  --hostname "$gitlab_host"
```

Apply the review checklist across 7 categories:

| Category | What to Check |
|---|---|
| **Correctness** | Logic errors, off-by-ones, null handling, edge cases, race conditions |
| **Type Safety** | Type mismatches, unsafe casts, `any` usage, missing generics |
| **Pattern Compliance** | Matches project conventions (naming, file structure, error handling, imports) |
| **Security** | Injection, auth gaps, secret exposure, SSRF, path traversal, XSS |
| **Performance** | N+1 queries, missing indexes, unbounded loops, memory leaks, large payloads |
| **Completeness** | Missing tests, missing error handling, incomplete migrations, missing docs |
| **Maintainability** | Dead code, magic numbers, deep nesting, unclear naming, missing types |

Assign severity:

| Severity | Meaning | Action |
|---|---|---|
| **CRITICAL** | Security vulnerability or data loss risk | Must fix before merge |
| **HIGH** | Bug or logic error likely to cause issues | Should fix before merge |
| **MEDIUM** | Code quality issue or missing best practice | Fix recommended |
| **LOW** | Style nit or minor suggestion | Optional |

### Phase 4 — VALIDATE

Run available validation commands (platform-agnostic — same as before).

Detect project type from config files (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.) and run the matching commands:

**Node.js / TypeScript:**
```bash
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null
npm run lint
npm test
npm run build
```

**Rust:**
```bash
cargo clippy -- -D warnings
cargo test
cargo build
```

**Go:**
```bash
go vet ./...
go test ./...
go build ./...
```

**Python:**
```bash
pytest
```

Record pass/fail for each.

### Phase 5 — DECIDE

| Condition | Decision |
|---|---|
| Zero CRITICAL/HIGH issues, validation passes | **APPROVE** |
| Only MEDIUM/LOW issues, validation passes | **APPROVE** with comments |
| Any HIGH issues or validation failures | **REQUEST CHANGES** |
| Any CRITICAL issues | **BLOCK** — must fix before merge |

Special cases:
- Draft PR / WIP MR → Always use **COMMENT** (not approve/block)
- Only docs/config changes → Lighter review, focus on correctness
- Explicit `--approve` / `--request-changes` → Override decision (still report all findings)

### Phase 6 — REPORT

Write artifact at `.claude/reviews/<platform>-<N>-review.md`
(e.g. `.claude/reviews/pr-42-review.md` for GitHub, `.claude/reviews/mr-42-review.md` for GitLab),
unless the repo uses legacy `.claude/PRPs/reviews/`:

```markdown
# Review: <PR|MR> #<N> — <TITLE>

**Platform**: GitHub | GitLab (<host>)
**Reviewed**: <date>
**Author**: <author>
**Branch**: <head> → <base>
**Decision**: APPROVE | REQUEST CHANGES | BLOCK

## Summary
<1-2 sentence overall assessment>

## Findings

### CRITICAL
<findings or "None">

### HIGH
<findings or "None">

### MEDIUM
<findings or "None">

### LOW
<findings or "None">

## Validation Results

| Check | Result |
|---|---|
| Type check | Pass / Fail / Skipped |
| Lint | Pass / Fail / Skipped |
| Tests | Pass / Fail / Skipped |
| Build | Pass / Fail / Skipped |

## Files Reviewed
<list of files with change type: Added/Modified/Deleted>
```

### Phase 7 — PUBLISH

**GitHub:**
```bash
# APPROVE
gh pr review <N> --approve --body "<summary>"

# REQUEST CHANGES
gh pr review <N> --request-changes --body "<summary with required fixes>"

# COMMENT only (draft PR or informational)
gh pr review <N> --comment --body "<summary>"

# Inline comment on a specific line:
gh api "repos/{owner}/{repo}/pulls/<N>/comments" \
  -f body="<comment>" \
  -f path="<file>" \
  -F line=<line-number> \
  -f side="RIGHT" \
  -f commit_id="$(gh pr view <N> --json headRefOid --jq .headRefOid)"
```

**GitLab (glab):**

GitLab does not have one-shot "approve + body" the same way GitHub does. Use this mapping:

```bash
# APPROVE
glab mr approve <N>
glab mr note <N> --message "<summary>"

# REQUEST CHANGES
glab mr revoke <N> 2>/dev/null || true   # remove existing approval if any
glab mr note <N> --message "REQUEST CHANGES:\n\n<summary with required fixes>"

# COMMENT only
glab mr note <N> --message "<summary>"

# BLOCK (treat like REQUEST CHANGES + draft)
glab mr update <N> --draft
glab mr note <N> --message "BLOCK:\n\n<summary>"

# Inline comment on a specific line (GitLab discussions API):
encoded_path=$(printf '%s' "$project_path" | sed 's#/#%2F#g')
head_sha=$(glab mr view <N> --output json | jq -r '.diff_refs.head_sha')
base_sha=$(glab mr view <N> --output json | jq -r '.diff_refs.base_sha')
start_sha=$(glab mr view <N> --output json | jq -r '.diff_refs.start_sha')

glab api "projects/$encoded_path/merge_requests/<N>/discussions" \
  --hostname "$gitlab_host" \
  --method POST \
  -f body="<comment>" \
  -f "position[base_sha]=$base_sha" \
  -f "position[start_sha]=$start_sha" \
  -f "position[head_sha]=$head_sha" \
  -f "position[position_type]=text" \
  -f "position[new_path]=<file>" \
  -f "position[new_line]=<line-number>"
```

### Phase 8 — OUTPUT

Report to user:

```
<PR|MR> #<N>: <TITLE>
Platform: <github|gitlab(host)>
Decision: <APPROVE|REQUEST_CHANGES|BLOCK>

Issues: <critical_count> critical, <high_count> high, <medium_count> medium, <low_count> low
Validation: <pass_count>/<total_count> checks passed

Artifacts:
  Review: .claude/reviews/<pr|mr>-<N>-review.md
  URL: <PR/MR URL>

Next steps:
  - <contextual suggestions based on decision>
```

---

## Quick Reference — gh vs glab

| Action | GitHub (`gh`) | GitLab (`glab`) |
|---|---|---|
| View PR/MR | `gh pr view <N>` | `glab mr view <N>` |
| Show diff | `gh pr diff <N>` | `glab mr diff <N>` |
| List by branch | `gh pr list --head <b>` | `glab mr list --source-branch <b>` |
| Approve | `gh pr review <N> --approve` | `glab mr approve <N>` |
| Request changes | `gh pr review <N> --request-changes` | `glab mr revoke <N>` + note |
| Comment | `gh pr review <N> --comment` | `glab mr note <N> --message` |
| Raw API | `gh api ...` | `glab api ... --hostname <host>` |
| Auth check | `gh auth status` | `glab auth status --hostname <host>` |
| Auth login | `gh auth login` | `glab auth login --hostname <host>` |

---

## Edge Cases

- **No CLI for detected platform**: Fall back to local-only review (read diff, skip remote publish). Warn user with the install/auth steps.
- **Diverged branches**: Suggest `git fetch origin && git rebase origin/<base>` before review.
- **Large PR/MR (>50 files)**: Warn about review scope. Focus on source changes first, then tests, then config/docs.
- **SSH remote with non-standard port** (e.g. `ssh://git@code.iflytek.com:30004/...`): Platform detection on the host portion still works; `glab` uses the configured HTTPS API host, not the SSH port.
- **Unknown platform**: Ask the user which CLI to use, or whether to fall back to local-only review.
