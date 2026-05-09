# BMAD-METHOD → Conductor Mapping

Reference for `conductor-distill` when `--source bmad` (or `both`) is selected. BMAD-METHOD is not vendored in this repo, so the runtime acquires it via one of two paths:

1. **Local clone** (preferred). User points to a clone of `https://github.com/bmad-code-org/BMAD-METHOD`. The skill reads files directly from disk.
2. **Context7 fetch**. Use `mcp__plugin_context7_context7__query-docs` with library `bmad-code-org/bmad-method` to fetch the relevant agent or template, narrowed by topic.

If neither is available, skip BMAD entirely and report it.

All blocks produced from this file MUST satisfy the intent-only checklist in `distillation-blocks.md`. If a candidate sentence would only make sense by referencing this repo's code, drop it.

---

## Why BMAD maps cleanly into conductor

BMAD organizes work as a sequence of agent personas (analyst → PM → architect → SM → dev → QA) plus per-stage templates. That is methodology, not facts. It maps almost 1-to-1 onto conductor's `spec → plan → implement → review` arc.

Conductor's invariant — *intent layer is document-driven and does not compete with code for the fact layer* — fits BMAD because BMAD's templates are structural (sections, headings, prompts) rather than code-derived.

---

## bmad/agent-analyst

- `source=bmad/agent-analyst`
- targets: `spec.md`
- extract:
  - the analyst persona expectations: clarify problem, surface constraints, define users and success criteria before solutioning
  - the discipline of "elicit, don't assume"
- drop:
  - any specific BMAD CLI invocation strings
  - any references to BMAD's own file paths
- output shape:
  - "Analyst lens" prompt block: questions the spec must answer before being approved

---

## bmad/agent-pm + bmad/template-prd

- `source=bmad/agent-pm`
- targets: `spec.md`
- extract from the PRD template:
  - section skeleton: Problem, Users, Goals, Non-Goals, Success Metrics, Constraints, Risks, Open Questions
  - the rule that every section header should have content or be explicitly marked "n/a"
- drop:
  - sample text from the BMAD template that names other projects
- output shape:
  - "PRD section skeleton" block — a header list, not pre-filled content

The user fills the headers with project facts. Those facts live *outside* the distilled block. The block contains only the skeleton.

---

## bmad/agent-architect + bmad/template-architecture

- `source=bmad/agent-architect`
- targets: `spec.md`
- extract:
  - architectural-thinking prompts: boundaries, data flow, failure modes, scaling shape
  - NFR prompts: performance, reliability, security, observability, cost
  - "decide and record" — every architectural decision gets a one-paragraph note (problem, options considered, decision, consequences)
- output shape:
  - "Architecture lens" prompts list
  - "ADR-lite shape" block

Do not pre-fill ADRs with this codebase's actual decisions. The block is the prompt; the answers are human-authored outside the markers.

---

## bmad/agent-sm + bmad/template-story

- `source=bmad/agent-sm`
- targets: `spec.md`, `plan.md`
- extract for `spec.md`:
  - story-format expectations: "As a … I want … so that …"
  - acceptance-criteria style: testable, behavior-shaped, no implementation detail
- extract for `plan.md`:
  - story-shaped task units: each plan task is the size of one story, with acceptance criteria attached
  - one story in flight at a time per executor
- output shape:
  - `spec.md`: "Story shape" block
  - `plan.md`: "Story-sized tasks" reminder, complementing the existing conductor `<Plan_Format>`

---

## bmad/agent-dev

- `source=bmad/agent-dev`
- targets: `spec.md`, `plan.md`
- extract:
  - dev-agent execution principles: take one story at a time, verify per change, do not silently expand scope
  - "evidence per change" — every implementation step records what was run and what was observed
- output shape:
  - `spec.md`: "Implementation discipline" reminder
  - `plan.md`: "Per-task evidence" reminder (overlaps verification-before-completion; that is fine — both come from the same principle)

---

## bmad/agent-qa

- `source=bmad/agent-qa`
- targets: `review.md`
- extract:
  - NFR gate: explicit pass/fail per non-functional requirement
  - risk profile: what could go wrong post-merge, with mitigations
  - traceability: each acceptance criterion ties to a check that was actually run
- output shape:
  - "NFR gate" table skeleton
  - "Risk profile" prompt list
  - "Traceability" rule

---

## What NOT to import from BMAD

- BMAD's specific orchestration commands (e.g., its own slash commands or shell entries).
- BMAD's example projects and sample artifacts.
- BMAD's runtime tool definitions — they belong to BMAD's harness, not to a conductor track.
- Any BMAD content that asserts product behavior of the local repository.

If the user wants BMAD's full agent runtime, they should run BMAD itself. This skill only borrows the document-shaped methodology.

---

## When BMAD docs are ambiguous

BMAD evolves. If a piece of upstream content can be read in two ways, prefer:
- the *prompt-shaped* interpretation over the *automation-shaped* interpretation,
- the *role discipline* interpretation over the *workflow plumbing* interpretation,
- the *generalizable* interpretation over the *BMAD-internal* interpretation.

When in doubt, drop it. A smaller, cleaner intent overlay beats a larger, leakier one.
