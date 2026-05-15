# Coding Discipline

These are always-on guardrails for non-trivial coding work.

## Think Before Coding

- State assumptions that materially affect design, scope, or behavior.
- Surface ambiguity instead of silently choosing an interpretation.
- Ask for clarification when missing detail can change the implementation.
- Prefer the simpler path when it still satisfies the real goal.

## Simplicity First

- Make the smallest correct change that solves the task.
- Do not add speculative features, configuration, or extension points.
- Avoid new abstractions for one-off logic.
- If the solution expands quickly, step back and simplify it.

## Surgical Changes

- Change only the files and lines required for the task.
- Match existing patterns unless the task explicitly requires a new one.
- Do not refactor adjacent code, comments, or formatting as a drive-by edit.
- Clean up only unused code introduced by your own change unless asked.

## Goal-Driven Execution

- Turn vague requests into concrete success criteria.
- Verify behavior with tests or explicit checks whenever practical.
- Tie multi-step work to validation at each step.
- Do not claim completion without fresh evidence from the workspace.

## Platform Routing (GitHub vs GitLab)

Before running any remote-collaboration command (PR/MR view/diff/create/comment/approve/merge), **first detect the platform from the active repo's `origin` remote**, then pick the matching CLI. Never hardcode `gh` or `glab`.

```bash
remote=$(git remote get-url origin 2>/dev/null)
case "$remote" in
  *github.com*)       platform=github; cli=gh ;;
  *code.iflytek.com*) platform=gitlab; cli=glab; host=code.iflytek.com ;;
  *gitlab*)           platform=gitlab; cli=glab
                      host=$(echo "$remote" | sed -E 's#.*[@/]([^:/]+)[:/].*#\1#') ;;
  *)                  platform=unknown ;;
esac
```

If `platform=unknown`: ask the user to confirm before continuing.

**Authoritative `gh ↔ glab` mapping** (apply this translation whenever an instruction or upstream skill uses `gh` but the active repo is GitLab):

| Action | GitHub (`gh`) | GitLab (`glab`) |
|---|---|---|
| View PR/MR | `gh pr view <N>` | `glab mr view <N>` |
| Diff | `gh pr diff <N>` | `glab mr diff <N>` |
| List by branch | `gh pr list --head <b>` | `glab mr list --source-branch <b>` |
| Create | `gh pr create --title ... --body ...` | `glab mr create --title ... --description ... --source-branch ... --target-branch ... --yes` |
| Approve | `gh pr review <N> --approve` | `glab mr approve <N>` |
| Request changes | `gh pr review <N> --request-changes` | `glab mr revoke <N>` + `glab mr note <N> --message "..."` |
| Comment | `gh pr review <N> --comment` | `glab mr note <N> --message "..."` |
| Merge | `gh pr merge <N>` | `glab mr merge <N>` |
| CI status | `gh pr checks` | `glab ci status` |
| Raw API | `gh api ...` | `glab api ... --hostname <host>` |
| Auth check | `gh auth status` | `glab auth status --hostname <host>` |
| PR template path | `.github/PULL_REQUEST_TEMPLATE*` | `.gitlab/merge_request_template*` |
| File link path | `/blob/<ref>/<path>` | `/-/blob/<ref>/<path>` |

For inline review comments on GitLab, use the GitLab discussions API with `diff_refs.base_sha/start_sha/head_sha` and `position[position_type]=text` (see `.local/commands/code-review.md` Phase 7 for the full call).

When the upstream skill or command names a fixed CLI command, treat that as a *template*: substitute the matching command from the table above based on the detected platform. The hard-overridden commands in `.local/commands/` (`code-review.md`, `pr.md`, `prp-pr.md`) already route correctly; this rule covers everything else.

**Self-hosted iflytek GitLab one-time setup** (only needed once per machine):

```bash
glab auth login --hostname code.iflytek.com
# HTTPS + Personal Access Token (scope: api, read_repository, write_repository)
# Token: https://code.iflytek.com/-/user_settings/personal_access_tokens
```
