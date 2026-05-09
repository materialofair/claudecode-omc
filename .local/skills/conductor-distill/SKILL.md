---
name: conductor-distill
description: Distill methodology from superpowers and BMAD-METHOD docs into the active conductor track's spec.md / plan.md / review.md as intent-layer overlays. Use when user asks to "distill superpowers into conductor", "把 superpowers/bmad 提炼到 conductor", "import method docs to track", "seed conductor with brainstorming/TDD/verification gates", or "feed BMAD PRD/architecture/story/QA principles into the track". Writes only inside marker blocks so it never competes with code-derived facts and re-runs cleanly. DO NOT use for general superpowers invocation, code refactors, or to summarize this codebase.
argument-hint: "[--track <slug>] [--source superpowers|bmad|both] [--target spec|plan|review|all] [--dry-run] [--refresh]"
disable-model-invocation: false
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - AskUserQuestion
model: sonnet
---

# Conductor Distill

<Purpose>
Pull intent-layer content from external methodology docs (Anthropic superpowers, BMAD-METHOD) into the active conductor track artifacts. The skill seeds `spec.md`, `plan.md`, and `review.md` with phase gates, principles, and checklists drawn from those upstream sources, while staying out of the fact layer the code itself owns.
</Purpose>

<Use_When>
- User asks to distill / 提炼 / import superpowers into a conductor track
- User asks to fold BMAD agent prompts (analyst, PM, architect, dev, QA) into a track
- A new conductor track was created and lacks methodology scaffolding
- An existing track is drifting from the agreed gates and needs re-seeding
</Use_When>

<Do_Not_Use_When>
- No conductor track exists yet — run `conductor setup` and `conductor track <title>` first
- User wants to actually invoke superpowers / write code — go to those skills directly
- User wants to summarize the local codebase or extract facts from source — that is the fact layer; this skill stays out of it
- The conductor artifacts already contain the same blocks and the user did not ask for `--refresh`
</Do_Not_Use_When>

<Core_Invariant>
**Conductor's intent layer is document-driven and does not compete with code for the fact layer.**

This means:
- Distilled blocks contain *methodology* (principles, gates, checklists, prompts, role expectations).
- Distilled blocks must NOT contain claims about the local code: file names, line numbers, function bodies, test counts, config values, or any observed runtime state.
- If a fact about the code belongs anywhere, it goes in the human-authored sections of `spec.md` / `plan.md`, not inside distilled blocks.
- Distilled blocks are clearly fenced with markers so reviewers can tell methodology from project-specific content at a glance.

If a distillation candidate would only make sense by referencing this repo's code, drop it. The intent layer is the wrong place for it.
</Core_Invariant>

<Distillation_Block_Format>
Every distilled section is wrapped in HTML-style markers so it is idempotent and machine-replaceable:

```markdown
<!-- conductor:distilled BEGIN source=<source-id> target=<artifact> layer=intent version=YYYY-MM-DD -->
> Source: <human-readable origin>. This block is intent-layer guidance distilled from upstream methodology and contains no claims about the local code.

<distilled content here>

<!-- conductor:distilled END source=<source-id> -->
```

Rules:
- `<source-id>` is stable: e.g. `superpowers/brainstorming`, `superpowers/test-driven-development`, `bmad/agent-architect`, `bmad/template-prd`.
- One block per source per artifact. Re-running with `--refresh` replaces the block matched by `source=` and `target=`.
- Never nest blocks. Never split one source across multiple blocks in the same artifact.
- Outside the markers is human / conductor / code territory and must be preserved verbatim on re-runs.

See `references/distillation-blocks.md` for the full template per target artifact and the intent-only checklist used before writing each block.
</Distillation_Block_Format>

<Inputs>
Sources (read-only, scanned at runtime):
- `bundled/upstream/superpowers/skills/<skill>/SKILL.md` — primary superpowers source in this repo.
- `.upstream/superpowers/skills/<skill>/SKILL.md` — fallback if the bundled copy is missing.
- BMAD-METHOD: not vendored in this repo. Either (a) read a user-supplied local clone path, or (b) fetch via Context7 (`mcp__plugin_context7_context7__query-docs` with library `bmad-code-org/bmad-method`). Prefer (a) when available.

Targets (read-write, one per active track):
- `.omc/conductor/tracks/<slug>/spec.md`
- `.omc/conductor/tracks/<slug>/plan.md`
- `.omc/conductor/tracks/<slug>/review.md` (create if missing — start from a methodology-only template)

Track resolution:
- If `--track <slug>` is provided, use it.
- Else read `.omc/conductor/conductor-state.json:activeTrack`.
- If no active track, stop and tell the user to run conductor setup first.
</Inputs>

<Workflow>
1. **Resolve track.** Locate active track from `conductor-state.json`. Verify `tracks/<slug>/metadata.json` exists. If not, stop with a clear "no active track" message.

2. **Decide sources.** From `--source` and conversation context, pick `superpowers`, `bmad`, or `both`. If `bmad` is requested but no local clone path is known, ask the user once whether to (a) point to a clone, (b) fetch via Context7, or (c) skip BMAD this run.

3. **Decide targets.** From `--target`, pick the artifacts to update. Default `all` means `spec.md`, `plan.md`, and `review.md`.

4. **Load mappings.** Read `references/superpowers-mapping.md` and/or `references/bmad-mapping.md` to know which source maps to which target and what the intent-only summary should look like. If a requested source does not appear in either mapping file, skip it and report `unsupported-source: <name>` in the per-file summary rather than silently omitting it.

5. **Read sources.** For each mapped source, read the upstream doc and extract only the intent-layer signal (principles, gates, checklists, role prompts, plan/spec/review structure). Apply the intent-only checklist from `references/distillation-blocks.md`. If a candidate item leaks fact-layer content, drop or rephrase it.

6. **Plan writes.** For each `(source, target)` pair, build the distilled block. Compose the full block text including markers and the boilerplate `> Source:` line.

7. **Dry run or apply.**
   - If `--dry-run` (or the user did not yet authorize writes): print the per-file plan with proposed block headers and a 5-10 line preview of each block, then ask the user to confirm via `AskUserQuestion`.
   - Otherwise apply writes.

8. **Apply writes idempotently.**
   - For each target file:
     - If the file is missing and the target is `review.md`, create it from the review template in `references/distillation-blocks.md`.
     - For each block to write, search for an existing `<!-- conductor:distilled BEGIN source=<source-id> target=<artifact> ... -->...<!-- conductor:distilled END source=<source-id> -->` region.
       - If absent: append the block at the bottom under a `## Distilled Methodology` heading (create the heading if missing).
       - If present and `--refresh` is set: replace the region in place.
       - If present and `--refresh` is not set: skip it and report `unchanged`.
   - Never modify content outside marker blocks.
   - Never delete user content.

9. **Report.** Output a per-file summary: which blocks were added, refreshed, skipped, or dropped (with reason). Include a final reminder that distilled blocks are intent-layer only.

10. **Post-conditions.** Do not mutate `metadata.json`, `conductor-state.json`, or any code. The skill is purely a writer of methodology overlays into track artifacts.
</Workflow>

<Mapping_Summary>
The complete tables live in `references/superpowers-mapping.md` and `references/bmad-mapping.md`. Headline routing:

| Source | spec.md | plan.md | review.md |
|--------|---------|---------|-----------|
| superpowers/brainstorming | design-gate principles, "no implementation before approval" | — | — |
| superpowers/writing-plans | — | plan header, file-structure section, bite-sized step granularity, header reminder | — |
| superpowers/test-driven-development | — | red-green-refactor stages and "watch it fail" rule on each task | TDD checks |
| superpowers/verification-before-completion | — | per-task verification command convention | evidence-before-claims checklist |
| superpowers/systematic-debugging | — | debugging stage protocol when a phase fails | bug-bisection checklist |
| superpowers/requesting-code-review | — | — | review-request shape |
| superpowers/receiving-code-review | — | — | how to triage feedback before implementing |
| superpowers/finishing-a-development-branch | — | — | branch-finish gate (merge / PR / cleanup) |
| bmad/agent-analyst | analyst persona expectations for the spec | — | — |
| bmad/agent-pm + bmad/template-prd | PRD section skeleton (problem, users, success metrics, non-goals) | — | — |
| bmad/agent-architect + bmad/template-architecture | architectural-decision section skeleton, NFR prompts | — | — |
| bmad/agent-sm + bmad/template-story | story-driven task decomposition principles | story-shaped task units | — |
| bmad/agent-dev | dev-agent execution principles (one story at a time, evidence per change) | "per-task evidence" reminder | — |
| bmad/agent-qa | — | — | NFR gate, risk profile, traceability checks |

Each row maps to an intent-only block. None of them inject local file paths, code symbols, or test results.
</Mapping_Summary>

<Anti_Fact_Layer_Guardrails>
Before writing each block, run the checklist in `references/distillation-blocks.md`. The short version:

- The block must read as methodology even if the repo were empty.
- The block must not name local files, symbols, branches, commits, or test counts.
- The block must not assert the project's current behavior.
- The block must not duplicate code that already lives in the repo.
- If a candidate sentence fails any of the above, rewrite it as a principle or drop it.

These guardrails enforce the user constraint: conductor's intent layer is document-driven and does not compete with code for the fact layer.
</Anti_Fact_Layer_Guardrails>

<Failure_Handling>
- No conductor track: stop and tell the user to run `conductor setup` / `conductor track <title>` first.
- Source missing (e.g., bundled superpowers absent and `.upstream/` also empty): report which source is unavailable and continue with the rest.
- BMAD unavailable: ask once, then skip BMAD if the user declines a clone path or Context7 fetch.
- Target file write fails: stop, report the path and error, and do not partially write.
- Marker collision (a block with a different shape already uses the same `source=` id): refuse to write, ask the user how to resolve.
- Detected fact-layer leakage during composition: drop the offending sentence and note it in the report rather than writing it.
</Failure_Handling>

<Examples>
<Good>
User: "distill superpowers into the active conductor track, dry run first"
Action: resolve active track → plan blocks for spec/plan/review from the superpowers mapping → print preview → ask for approval before applying.
</Good>

<Good>
User: "把 BMAD 的 PRD 和 architect 的部分塞进 spec.md，plan.md 不要动"
Action: source=bmad, target=spec, write `bmad/agent-pm + bmad/template-prd` and `bmad/agent-architect + bmad/template-architecture` blocks into `spec.md` only.
</Good>

<Good>
User: "refresh distilled blocks on payment-webhook-retry"
Action: --track payment-webhook-retry --refresh, replace existing blocks in place by `source=` id, leave non-block content untouched.
</Good>

<Bad>
User: "use superpowers TDD now to fix this bug"
Why bad: the user wants to actually do TDD on the codebase. Route to the TDD skill, not this distiller.
</Bad>

<Bad>
User: "summarize what our auth code does into spec.md"
Why bad: that is fact-layer content. This skill writes methodology only. Decline and suggest a code-reading agent.
</Bad>
</Examples>

<Final_Checklist>
- [ ] Active conductor track resolved before any write
- [ ] Sources confirmed available (superpowers and/or BMAD)
- [ ] Each candidate block passed the intent-only checklist
- [ ] Blocks fenced with the standard `conductor:distilled` markers
- [ ] Existing blocks refreshed only when `--refresh` is set
- [ ] No content outside markers was modified
- [ ] No code-derived facts written into any block
- [ ] Per-file summary printed for the user
</Final_Checklist>
