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
`Setup -> Track -> Spec -> Plan -> Implement -> Review -> Reconcile`
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
This skill is aligned to the stronger Conductor protocol in `oh-my-codex` and adapted to Claude runtime primitives.

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
</Execution_Policy>

<Directory_Contract>
Use this Claude/OMC file layout:

```text
.omc/conductor/
  conductor-state.json
  context/
    product.md
    tech-stack.md
    workflow.md
    styleguides/*.md
  specs/
    <track-slug>.md
  plans/
    <track-slug>.md
  reviews/
    <track-slug>.md
  research/
    <track-slug>/
      state.json
      findings.md
```

State reference:
- `conductor-state.json` stores `active`, `activeTrack`, `tracks`, context pointers, and metadata.
- Track phases should stay consistent with runtime types: `setup | idle | spec | planning | implementing | reviewing | complete`.
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
</Subcommand_Routing>

<Workflow>
1. **Setup / Resume**
   - If `conductor-state.json` exists and `active=true`, resume.
   - Otherwise initialize `.omc/conductor/` and context documents.
   - Bootstrap tech stack from `.omc/project-memory.json` when available.

2. **Track Selection**
   - If user provided slug/title, resolve it.
   - Else choose active track first, otherwise earliest non-complete track.
   - If no track exists, create one from user goal (`track` stage).

3. **Preflight Context**
   - Read in order: context docs -> active spec -> active plan -> relevant code/config.
   - Output compact brief: goal, accepted constraints, current phase, next task.

4. **Spec Generation**
   - Delegate to `analyst` (sonnet/opus) for requirements structure.
   - Delegate to `architect` (opus) for system boundaries and risks.
   - Persist to `.omc/conductor/specs/<slug>.md`.

5. **Plan Generation**
   - Delegate to `planner` (sonnet/opus) for phased tasks.
   - Require testable acceptance criteria and explicit verification commands.
   - Persist to `.omc/conductor/plans/<slug>.md`.

6. **Implement**
   - Execute tasks in small slices via `executor`.
   - Keep plan checkboxes in sync (`[ ]`, `[~]`, `[x]`).
   - Run deterministic checks per slice (lint/type/test/build as applicable).

7. **Review**
   - Use `code-reviewer` and `verifier` as default review pair.
   - Add `security-reviewer` when auth, secrets, trust-boundaries, or user input changed.
   - Persist verdict to `.omc/conductor/reviews/<slug>.md`.

8. **Reconcile / Close**
   - If review fails, reopen tasks and return to implement.
   - If review passes, mark track complete and record concise evidence.
</Workflow>

<Research_Integration>
When uncertainty is high (new SDKs, conflicting docs, unknown architecture edges), run a research pass before locking spec/plan.

Trigger examples:
- External dependency behavior changed recently
- Two plausible architectural options with unclear tradeoffs
- Security/compliance requirement needs primary-source confirmation

Research protocol (adapted from `research` skill):
1. **Decompose** into 3-5 stages.
2. **Parallel execute** stage analysis with `scientist` agents (max 5 concurrent).
3. **Verify** contradictions; output `[VERIFIED]` or `[CONFLICTS:<list>]`.
4. **Synthesize** into a decision note appended to spec/plan.

Persist research artifacts:
- `.omc/conductor/research/<track-slug>/state.json`
- `.omc/conductor/research/<track-slug>/findings.md`
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
- Implementation: `executor` (sonnet by default)
- Test strategy/fixes: `test-engineer` (sonnet)
- Review/validation: `code-reviewer` + `verifier` (+ `security-reviewer` when needed)
- Research branches: `scientist` (haiku/sonnet/opus by tier)
</Agent_Routing>

<Status_Contract>
`status` output should always include:
- active track
- track phase
- progress summary (completed/in-progress/pending)
- next concrete action
- blockers (or `None`)
- latest review verdict (if present)
- research verification status (if research was run)
</Status_Contract>

<Failure_Handling>
- If setup/context files are missing: stop and run setup first
- If plan is missing: do not implement; return to plan phase
- If verification fails: reopen related tasks and continue implementation
- If evidence is insufficient in research mode: emit `[PROMISE:RESEARCH_BLOCKED]` with blocker details
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

<Bad>
User: "conductor fix typo in README"
Why bad: Tiny one-off task; overhead exceeds benefit.
</Bad>
</Examples>

<Final_Checklist>
- [ ] Conductor state initialized or resumed correctly
- [ ] Active track resolved deterministically
- [ ] Spec and plan artifacts exist and are current
- [ ] Implementation updates map back to plan tasks
- [ ] Review artifacts recorded with clear verdict
- [ ] Research evidence attached for high-uncertainty decisions
- [ ] Status reports actionable next step and blockers
</Final_Checklist>
