---
name: conductor
description: Use when user wants durable Context->Spec->Plan->Implement tracks ('conductor', 'structured workflow', 'track this', 'context then plan'). Creates and governs `.omc/conductor/` artifacts for Claude Code multi-session delivery.
argument-hint: "<subcommand | track-goal>"
level: 4
---

# Conductor

<Purpose>
Conductor is a durable track-management workflow for Claude Code. It preserves long-lived context on disk, turns ambiguous requests into spec+plan artifacts, and controls implementation/review so work can safely span multiple sessions.

Primary loop:
`Setup -> Track -> Spec(+approval) -> Plan(+approval) -> Implement -> Review -> Reconcile`
</Purpose>

<Use_When>
- User explicitly asks for `conductor`, `structured workflow`, or `track this`
- Work needs persistent artifacts and traceability across sessions
- Feature scope is large enough that spec and plan should be reviewed before coding
- Team needs deterministic progress reporting and reversible checkpoints
</Use_When>

<Do_Not_Use_When>
- Small one-off bugfix or single-file change (use direct executor flow)
- User wants immediate end-to-end autonomous build (use `autopilot`)
- User is still exploring alternatives with no commitment to tracked artifacts (use `omc-plan`/`ralplan` first)
</Do_Not_Use_When>

<Compatibility>
This skill is aligned to the Conductor protocol in `oh-my-codex`, adapted to Claude runtime primitives, and incorporates best practices from Gemini Conductor, Kiro SDD, and cc-sdd.

Preserved Conductor invariants:
- Durable context is on disk, not only in chat memory
- Work is represented as tracks
- Important tracks carry both spec and plan artifacts
- Review is a first-class stage before closure

Claude-specific adaptation:
- Use `Task(subagent_type="oh-my-claudecode:...")` for delegation
- Use `.omc/conductor/` paths used by OMC hooks
- Use `AskUserQuestion` for gated approvals when user decisions are required
</Compatibility>

<Execution_Policy>
- Keep a single active track by default unless user explicitly asks for parallel tracks
- Retrieval-first: read repository facts before proposing architecture or implementation
- Plan is the execution source of truth; do not silently drift from accepted plan
- Prefer minimal, reversible edits and checkpoint after each completed task cluster
- If tool calls fail, stop that phase, report blocker, and avoid speculative continuation
- Spec must be approved before plan generation; plan must be approved before implementation
</Execution_Policy>

<Directory_Contract>
Tracks are organized **per-track** — all artifacts for one track live in a single directory.
This makes it easy to browse, archive, or delete a complete feature, and keeps related spec+plan+review co-located for agent context loading.

### Primary directory (read-write)

```text
.omc/conductor/
  conductor-state.json          # Index of all tracks (regenerable from track metadata)
  context/                      # Shared project context
    product.md
    tech-stack.md
    workflow.md
    styleguides/*.md
  tracks/
    <track-slug>/               # One directory per track
      metadata.json             # Track state, phase, git info, timestamps
      spec.md                   # Requirements specification
      plan.md                   # Phased implementation plan with task checkboxes
      review.md                 # Review verdict and evidence (created at review phase)
      research/                 # Optional: created when uncertainty is high
        state.json
        findings.md
  archive/                      # Completed or cancelled tracks moved here
```

### External directory discovery (read-only import)

Conductor also scans for tracks created by other tools (e.g., Codex conductor) so that work can be continued across tools without manual copying.

**Scan paths** (checked in order during Setup/Resume):
1. `.omc/conductor/tracks/` — primary, read-write
2. `conductor/tracks/` — Codex conductor layout, **read-only** import

**Discovery rules:**
- On Setup/Resume, scan each path for subdirectories containing `metadata.json` or `spec.md`.
- Codex tracks use a slightly different metadata schema. Normalize on read:

| Codex field | Claude conductor field | Mapping |
|-------------|----------------------|---------|
| `track_id` | `track_id` | Direct |
| `type` (`"feature"`) | `type` | Direct |
| `status` (`"in_progress"`) | `status` → `phase` | `"in_progress"` → status `"in_progress"`, phase `"implementing"` |
| `description` | `description` | Direct |
| `created_at` / `updated_at` | `created_at` / `updated_at` | Direct |
| *(missing fields)* | `git_branch`, `git_start_commit`, `blocked_by`, `supersedes` | Default to `null` |

- Codex tracks that have `spec.md` + `plan.md` but no `metadata.json` are also recognized — infer metadata from filenames and plan checkbox state.
- External tracks appear in `status` output with an `[external]` tag and their source path.
- External tracks are **read-only by default**. To work on an external track, conductor copies it into `.omc/conductor/tracks/<slug>/` first (prompted via `AskUserQuestion`).

**Context fallback:** If `.omc/conductor/context/` is empty or missing during setup, also check:
- `conductor/product.md` → seed `context/product.md`
- `conductor/tech-stack.md` → seed `context/tech-stack.md`
- `conductor/workflow.md` → seed `context/workflow.md`
- `conductor/code_styleguides/*.md` → seed `context/styleguides/*.md`

### conductor-state.json (index — regenerable from track metadata)

```json
{
  "active": true,
  "activeTrack": "<track-slug>",
  "tracks": {
    "<track-slug>": {
      "slug": "<track-slug>",
      "title": "Human-readable title",
      "type": "feature",
      "status": "in_progress",
      "phase": "implementing",
      "source": "primary | external"
    }
  },
  "_meta": {
    "version": "2.0.0",
    "lastWriteAt": "ISO8601",
    "cwd": "/path/to/project"
  }
}
```

### metadata.json (per-track — authoritative source of track state)

```json
{
  "track_id": "<track-slug>",
  "title": "Human-readable title",
  "type": "feature | bugfix | tech-debt | hotfix",
  "status": "spec | planned | in_progress | review | done | cancelled",
  "phase": "setup | spec | planning | implementing | reviewing | complete",
  "description": "Short summary of the track goal",
  "supersedes": null,
  "blocked_by": null,
  "git_branch": "conductor/<track-slug>",
  "git_start_commit": "<sha>",
  "current_task_index": 0,
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "completed_at": null
}
```

### State management rules

- `metadata.json` in each track is the **authoritative** source for that track's state.
- `conductor-state.json` is an **index/cache** that summarizes all tracks for quick lookup.
- If `conductor-state.json` is missing or stale, regenerate it from `tracks/*/metadata.json`.
- Track status transitions happen in `metadata.json` first, then sync to the index.
</Directory_Contract>

<Subcommand_Routing>
Native command hooks currently support:
- `setup`
- `track <title> [description]`
- `plan <slug>`
- `review <slug>`
- `status [slug]`

Conductor workflow operations (can be executed by skill protocol even if no dedicated slash command exists):
- `implement <slug|active>`
- `refresh [scope]`
- `revert <slug>`
- `archive <slug>`
</Subcommand_Routing>

<Workflow>
1. **Setup / Resume**
   - If `conductor-state.json` exists and `active=true`, resume from current phase.
   - Otherwise initialize `.omc/conductor/` and context documents.
   - Bootstrap `context/tech-stack.md` from `.omc/project-memory.json`, AGENTS.md, or package.json when available.
   - Bootstrap `context/product.md` from README.md, existing conductor docs, or user input.
   - **Cross-directory scan**: also check `conductor/` (Codex layout) for existing context docs and tracks (see External Directory Discovery).
   - If context files in `.omc/conductor/context/` are empty but `conductor/product.md` etc. exist, seed from them.
   - On resume: read all `tracks/*/metadata.json` from **both** primary and external paths to reconstruct index, output compact status brief.

2. **Track Selection / Creation**
   - If user provided slug/title, resolve it against tracks from **all** discovered paths (primary + external).
   - If the resolved track is external, ask user whether to import it into `.omc/conductor/tracks/` before proceeding.
   - Else choose active track first, otherwise earliest non-complete track.
   - If no track exists, create one:
     - Generate URL-safe slug from title (e.g., `payment-webhook-retry`)
     - Create `tracks/<slug>/metadata.json` with initial phase `spec`
     - Create git branch `conductor/<slug>` from current HEAD
     - Update `conductor-state.json` index

3. **Preflight Context**
   - Read in order: context docs → active spec → active plan → relevant code/config.
   - Output compact brief: goal, accepted constraints, current phase, next task, blockers.

4. **Spec Generation** (phase: `spec`)
   - Delegate to `analyst` (sonnet/opus) for requirements structure.
   - Delegate to `architect` (opus) for system boundaries, risks, and acceptance criteria.
   - Persist to `tracks/<slug>/spec.md`.
   - **Gate: present spec to user for approval via `AskUserQuestion` before proceeding.**
   - Update `metadata.json` status to `planned` only after approval.

5. **Plan Generation** (phase: `planning`)
   - Delegate to `planner` (sonnet/opus) for phased tasks.
   - Plan must follow the phased task format (see Plan Format below).
   - Require testable acceptance criteria and explicit verification commands.
   - Persist to `tracks/<slug>/plan.md`.
   - **Gate: present plan to user for approval via `AskUserQuestion` before proceeding.**
   - Optionally delegate to `critic` (opus) for plan review before user approval.

6. **Implement** (phase: `implementing`)
   - Execute tasks sequentially per plan phase via `executor`.
   - Before starting each task: update its checkbox from `[ ]` to `[~]` in plan.md.
   - After completing each task: update its checkbox from `[~]` to `[x]` in plan.md.
   - Run deterministic checks per task (lint/type/test/build as applicable).
   - After completing the last task of each phase: run phase verification protocol.
   - Update `metadata.json` field `current_task_index` as tasks progress.

7. **Phase Verification** (within implement)
   - After completing the last task of a phase:
     1. Announce phase completion and run automated checks.
     2. Prepare a manual verification checklist for user-visible behavior.
     3. Wait for explicit user feedback via `AskUserQuestion`.
     4. Create a checkpoint commit when the phase is accepted.
     5. Record the checkpoint SHA in plan.md.
   - If verification fails: reopen relevant tasks, return to implement.

8. **Review** (phase: `reviewing`)
   - Use `code-reviewer` and `verifier` as default review pair.
   - Add `security-reviewer` when auth, secrets, trust-boundaries, or user input changed.
   - Compute git diff from `git_start_commit..HEAD` for the review scope.
   - Persist verdict to `tracks/<slug>/review.md`.

9. **Reconcile / Close**
   - If review fails, reopen tasks and return to implement.
   - If review passes, mark track complete and record concise evidence.
   - Update `metadata.json`: `status: "done"`, `phase: "complete"`, `completed_at: ISO8601`.
   - Optionally move completed track to `archive/` via `archive` subcommand.
</Workflow>

<Plan_Format>
Plans must follow phased task structure with checkboxes for progress tracking:

```markdown
# Implementation Plan

## Phase 1: <Phase Title>

- [ ] Task: <task description>
  - [ ] <sub-step 1>
  - [ ] <sub-step 2>
  - [ ] Verify relevant tests pass

- [ ] Task: <task description>
  - [ ] <sub-step 1>
  - [ ] Verify relevant tests pass

- [ ] Task: Conductor - Phase Verification '<Phase Title>'

## Phase 2: <Phase Title>
...
```

Rules:
- Each phase groups related tasks that can be verified together.
- Tasks use `[ ]` (pending), `[~]` (in-progress), `[x]` (done) checkboxes.
- Each phase ends with a verification gate task.
- Tasks should be ~1-3 hours of work each.
- Sub-steps are optional but encouraged for complex tasks.
</Plan_Format>

<Research_Integration>
When uncertainty is high (new SDKs, conflicting docs, unknown architecture edges), run a research pass before locking spec/plan.

Trigger examples:
- External dependency behavior changed recently
- Two plausible architectural options with unclear tradeoffs
- Security/compliance requirement needs primary-source confirmation

Research protocol:
1. **Decompose** into 3-5 research stages.
2. **Parallel execute** stage analysis with `scientist` agents (max 5 concurrent).
3. **Verify** contradictions; output `[VERIFIED]` or `[CONFLICTS:<list>]`.
4. **Synthesize** into a decision note appended to spec/plan.

Persist research artifacts inside the track directory:
- `tracks/<slug>/research/state.json`
- `tracks/<slug>/research/findings.md`
</Research_Integration>

<Research_Evidence_Format>
Use structured evidence blocks:

```text
[FINDING:<id>] <title>
<analysis>
[/FINDING]

[EVIDENCE:<id>]
- Source: <url or file>
- Date: <YYYY-MM-DD>
- Relevance: <why it matters>
[/EVIDENCE]

[CONFIDENCE:HIGH|MEDIUM|LOW]
<brief rationale>
```

Quality gates:
- Every `[FINDING]` must include `[EVIDENCE]`
- Unsupported claims must be downgraded or removed
- Unresolved contradictions must remain explicit
</Research_Evidence_Format>

<Agent_Routing>
- Setup/context scan: `explore` (haiku/sonnet)
- Requirements/spec: `analyst` + `architect` (sonnet/opus)
- Plan refinement: `planner` + `critic` (sonnet/opus)
- Implementation: `executor` (sonnet by default; use `model=opus` for complex tasks)
- Test strategy/fixes: `test-engineer` (sonnet)
- Review/validation: `code-reviewer` + `verifier` (+ `security-reviewer` when needed)
- Research branches: `scientist` (haiku/sonnet/opus by tier)
</Agent_Routing>

<Status_Contract>
`status` output should always include:
- active track (title + slug)
- track type and phase
- progress summary (phases completed / total, tasks completed/in-progress/pending)
- next concrete action
- blockers (or `None`)
- latest review verdict (if present)
- research verification status (if research was run)

Example:
```
## Conductor Status

**Active track:** payment-webhook-retry (feature)
**Phase:** implementing (3/4 phases done)
**Tasks:** 9/13 done, 1 in-progress, 3 pending
**Next:** Complete task "Add retry backoff logic" in Phase 4
**Blockers:** None
**Review:** Not yet started
```
</Status_Contract>

<Failure_Handling>
- If setup/context files are missing: stop and run setup first
- If plan is missing: do not implement; return to plan phase
- If spec not approved: do not generate plan; wait for approval
- If verification fails: reopen related tasks and continue implementation
- If evidence is insufficient in research mode: emit `[PROMISE:RESEARCH_BLOCKED]` with blocker details
- If `conductor-state.json` is missing or corrupt: regenerate from `tracks/*/metadata.json`
</Failure_Handling>

<Examples>
<Good>
User: "conductor track payment-webhook-retry and plan it"
Why good: Explicit track+planning request with durable artifacts.
</Good>

<Good>
User: "conductor for this multi-service auth refactor; do research first"
Why good: High-uncertainty, multi-session scope benefits from research-integrated conductor flow.
</Good>

<Good>
User: "conductor status"
Why good: Resume from where the last session left off with a compact status overview.
</Good>

<Bad>
User: "conductor fix typo in README"
Why bad: Tiny one-off task; overhead exceeds benefit.
</Bad>
</Examples>

<Final_Checklist>
- [ ] Conductor state initialized or resumed correctly
- [ ] Active track resolved deterministically
- [ ] Spec approved by user before plan generation
- [ ] Plan approved by user before implementation
- [ ] Implementation updates map back to plan tasks (checkboxes in sync)
- [ ] Phase verification gates executed after each plan phase
- [ ] Review artifacts recorded with clear verdict
- [ ] Research evidence attached for high-uncertainty decisions
- [ ] Status reports actionable next step and blockers
- [ ] metadata.json is authoritative; conductor-state.json stays in sync
</Final_Checklist>
