# Superpowers → Conductor Mapping

Reference for `conductor-distill`. For each upstream superpowers skill listed here, this file tells the runtime:

- which conductor artifact(s) it maps to
- what to extract (intent-layer only)
- what to drop
- the canonical `source=` id used in distilled markers

All blocks produced from this file MUST satisfy the intent-only checklist in `distillation-blocks.md`. If a candidate sentence would only make sense by referencing this repo's code, drop it.

Source lookup order at runtime:
1. `bundled/upstream/superpowers/skills/<skill>/SKILL.md`
2. `.upstream/superpowers/skills/<skill>/SKILL.md`

If neither path exists, skip the source and report it.

---

## brainstorming

- `source=superpowers/brainstorming`
- targets: `spec.md`
- extract:
  - the hard-gate rule: do not write code, scaffold, or invoke implementation skills before a design exists and the user approves it
  - the "even simple projects need a design" anti-pattern, paraphrased as a principle
  - the design-section approval pattern (present in sections, get approval per section)
  - the spec self-review items: placeholders, contradictions, ambiguity, scope
- drop:
  - the file path `docs/superpowers/specs/...` (project-specific to upstream usage)
  - any DOT graph (too verbose for the distilled block)
  - mentions of specific tools by name unless they are universal
- output shape:
  - short "Approval gates" paragraph
  - "Design self-review checklist" bullet list

---

## writing-plans

- `source=superpowers/writing-plans`
- targets: `plan.md`
- extract:
  - the plan-document header convention: Goal / Architecture / Tech Stack
  - the bite-sized task granularity rule (one action per step, ~2-5 minutes)
  - the "files map first, tasks second" principle
  - the per-task structure: Files (Create/Modify/Test), then Steps with checkboxes
- drop:
  - the literal save path `docs/superpowers/plans/...`
  - language about "agentic workers" or specific sub-skill names from upstream — generalize to "downstream executor"
- output shape:
  - "Plan header convention" block
  - "File mapping before tasks" principle
  - "Bite-sized step granularity" reminder

The conductor `<Plan_Format>` already defines phased tasks with `[ ] / [~] / [x]` checkboxes. The distilled block adds the *granularity and header* discipline on top, it does not override the conductor phase structure.

---

## test-driven-development

- `source=superpowers/test-driven-development`
- targets: `plan.md`, `review.md`
- extract for `plan.md`:
  - red-green-refactor cycle as the default per-task implementation order
  - the "watch it fail correctly" verification step
  - the rule that production code without a failing test first is not allowed
- extract for `review.md`:
  - reviewer expectation: every behavior change should have a test that previously failed
  - reviewer expectation: refactor commits should keep tests green
- drop:
  - the DOT cycle diagram (verbose)
  - the "delete the code" rule worded as punishment — keep the rule but soften the framing
- output shape:
  - `plan.md`: "Per-task TDD order" bullet list
  - `review.md`: "TDD checks" bullet list

---

## verification-before-completion

- `source=superpowers/verification-before-completion`
- targets: `plan.md`, `review.md`
- extract:
  - "evidence before assertions" — never claim done without a verifying command and its observed output
  - the rule that running tests in your head does not count
  - the rule that linters / type-checkers / test runners are the source of truth, not memory
- output shape:
  - `plan.md`: "Per-task verification command" reminder
  - `review.md`: "Evidence-before-claims" checklist (ran what / observed what / where it lives)

---

## systematic-debugging

- `source=superpowers/systematic-debugging`
- targets: `plan.md`, `review.md`
- extract:
  - reproduce first, then form a hypothesis, then bisect
  - one variable per experiment
  - the rule that proposed fixes need a confirmed root cause, not a guess
- output shape:
  - `plan.md`: "If a phase fails verification" debug protocol
  - `review.md`: "Bug bisection trail" checklist for review of bugfix tracks

---

## requesting-code-review

- `source=superpowers/requesting-code-review`
- targets: `review.md`
- extract:
  - the shape of a good review request: scope, what to focus on, what *not* to focus on, known caveats
  - the expectation that the requester runs verification before asking for review
- output shape:
  - "Review request shape" section that the track owner fills in before asking for review

---

## receiving-code-review

- `source=superpowers/receiving-code-review`
- targets: `review.md`
- extract:
  - triage feedback before implementing — not every comment is a directive
  - distinguish "questionable" from "wrong" — verify with evidence before pushing back
  - the warning against performative agreement
- output shape:
  - "Receiving review feedback" checklist

---

## finishing-a-development-branch

- `source=superpowers/finishing-a-development-branch`
- targets: `review.md`
- extract:
  - the structured options at branch finish: merge / PR / cleanup
  - the precondition: implementation complete and tests passing before deciding
- output shape:
  - "Branch finish gate" decision block

---

## subagent-driven-development / executing-plans / dispatching-parallel-agents / using-git-worktrees

These are upstream *execution* skills. They are mostly fact-layer in nature (which agent runs which task) and overlap with conductor's own agent routing. Distill only when the user asks for them by name. Default behavior: skip.

If asked, write a single intent-layer block summarizing:
- "Plans drive execution; agents do not free-run"
- "Independent tasks fan out; dependent tasks stay sequential"
- "Use isolated worktrees when changes are large or risky"

Do not list specific tools, commands, or worktree paths.

---

## using-superpowers / writing-skills / receiving-code-review (meta)

`using-superpowers` and `writing-skills` are about authoring skills, not about doing project work. Skip by default.
