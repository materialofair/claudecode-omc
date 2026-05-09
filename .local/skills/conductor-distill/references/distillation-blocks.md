# Distillation Blocks

Reference for `conductor-distill`. This file defines:

1. The exact marker format used to fence distilled methodology blocks.
2. The intent-only checklist run before writing each block.
3. The starter templates for each conductor target artifact when content is missing.

---

## 1. Marker format

Every distilled section uses paired HTML comments so Markdown renderers ignore them and humans can spot them:

```markdown
<!-- conductor:distilled BEGIN source=<source-id> target=<artifact> layer=intent version=YYYY-MM-DD -->
> Source: <human-readable origin>. Intent-layer guidance distilled from upstream methodology. No claims about local code.

<distilled content>

<!-- conductor:distilled END source=<source-id> -->
```

Field contract:

- `source=` is stable across runs. Examples: `superpowers/brainstorming`, `superpowers/test-driven-development`, `bmad/agent-architect`, `bmad/template-prd`.
- `target=` is one of `spec`, `plan`, `review`.
- `layer=intent` is fixed. Future fact-layer overlays (if ever introduced) would use a different layer tag and a different skill.
- `version=` is the date the block was last written/refreshed by this skill, in `YYYY-MM-DD` form.

Idempotency rule:
- One block per `(source, target)` pair per file.
- A `--refresh` run replaces the region between matching BEGIN/END markers with the same `source=` id.
- A non-refresh run leaves an existing block alone and reports it as `unchanged`.

Boundary rule:
- Anything outside the markers belongs to humans, conductor, or other tools. Never edit content outside markers.
- If a project author wants to comment on a distilled block, they should do it in the surrounding human section, not inside the markers.

---

## 2. Intent-only checklist

Run this checklist on every candidate block before writing it. If any answer is "yes" for the disqualifying questions, rewrite as a principle or drop the candidate.

Disqualify if any of these are true:

- The block names a file path inside this repo.
- The block names a function, class, module, or symbol from this repo.
- The block names a branch, commit SHA, PR number, or other VCS-specific identifier from this repo.
- The block reports a count of tests, files, lines, or any number that came from running tools against this repo.
- The block asserts current behavior of the local product ("our login does X").
- The block embeds output from a command run against this repo.
- The block could only be true for this codebase. (If you replaced the repo with an empty one, would the block still read sensibly as guidance? If no, drop it.)
- The block duplicates code that lives in this repo.

- The block pastes long verbatim passages from an upstream SKILL.md or template. Distilled blocks must paraphrase upstream guidance into principle-shaped sentences; literal copy-paste is not distillation even if the text contains no local facts. Rewrite as principles or compress to checklist bullets.

Soft-flag (rewrite, do not necessarily drop):

- The block uses upstream-specific paths like `docs/superpowers/...`. Generalize to `docs/specs/` or omit the path.
- The block names upstream-specific tools by trade name where a general phrase would do. Prefer the principle.
- The block contains DOT graphs or other heavy ASCII art. Compress to prose unless the user asked to keep it.

Encourage:

- Principle-shaped sentences ("X must happen before Y").
- Checklists framed as questions ("Did you observe the failure before claiming a fix?").
- Role expectations ("The reviewer focuses on …").
- Section-skeletons (header lists, NFR prompts, ADR shape).
- Phase-gate rules ("Spec is approved before plan is written").

A good distilled block survives "would this still make sense for a totally different project?" with a yes.

---

## 3. Target artifact templates

The skill writes blocks under a single `## Distilled Methodology` heading per file. If the heading is missing, create it before adding the first block.

### 3.1 `spec.md`

Append distilled blocks under:

```markdown
## Distilled Methodology

<!-- conductor:distilled BEGIN ... -->
...
<!-- conductor:distilled END ... -->
```

Order of blocks (when multiple sources are written):
1. `superpowers/brainstorming` (approval gate, design self-review)
2. `bmad/agent-analyst` (analyst lens)
3. `bmad/agent-pm` (PRD section skeleton)
4. `bmad/agent-architect` (architecture lens, ADR-lite shape)
5. `bmad/agent-sm` (story shape)
6. `bmad/agent-dev` (implementation discipline)

### 3.2 `plan.md`

Append distilled blocks under:

```markdown
## Distilled Methodology

<!-- conductor:distilled BEGIN ... -->
...
<!-- conductor:distilled END ... -->
```

Order:
1. `superpowers/writing-plans` (header, file mapping, granularity)
2. `superpowers/test-driven-development` (per-task TDD)
3. `superpowers/verification-before-completion` (per-task verification)
4. `superpowers/systematic-debugging` (failure-recovery protocol)
5. `bmad/agent-sm` (story-sized task reminder)
6. `bmad/agent-dev` (per-task evidence)

The conductor `<Plan_Format>` defines the *phase* skeleton. Distilled blocks add discipline that applies *inside* each task. Do not rewrite the phase skeleton from the distilled side.

### 3.3 `review.md`

Creation policy: conductor itself initializes `review.md` at the review phase. To avoid stomping on conductor's structure:
- If `review.md` **already exists**: append a `## Distilled Methodology` heading at the bottom (if not present) and add blocks under it. Never touch content above the heading.
- If `review.md` **does not exist and the track phase is pre-review**: create it from the minimal template below, then add blocks.
- If `review.md` **does not exist but track phase is already at review or later**: stop, report the missing file, and ask the user whether to create it rather than silently creating a stub that could conflict with conductor's own initialization.

Minimal template (used only when creating from scratch):

```markdown
# Review

> Verdict and evidence for this conductor track. Distilled methodology lives below; project-specific review notes live above the methodology heading.

## Verdict

_Pending._

## Evidence

_None yet._

## Distilled Methodology

<!-- distilled blocks go here -->
```

Order of blocks:
1. `superpowers/test-driven-development` (TDD checks)
2. `superpowers/verification-before-completion` (evidence-before-claims)
3. `superpowers/requesting-code-review` (request shape)
4. `superpowers/receiving-code-review` (triage feedback)
5. `superpowers/systematic-debugging` (bisection trail, when relevant)
6. `superpowers/finishing-a-development-branch` (branch finish gate)
7. `bmad/agent-qa` (NFR gate, risk profile, traceability)

---

## 4. Block content style

- Lead with one sentence stating what the block governs.
- Use short bullets or short numbered lists. Avoid long paragraphs.
- Prefer imperative voice ("Reproduce before forming a hypothesis.").
- Keep each block under ~30 lines. If a source needs more, split by sub-topic only if both halves still pass the intent-only checklist; otherwise pick the higher-leverage half.
- Always end the block with the closing marker. Always.

A reader scanning the file should be able to tell, from the markers and the boilerplate `> Source:` line alone, which sentences are methodology overlay and which are project-specific.

---

## 5. Failure modes to refuse

The skill must refuse to write a block when:

- The same `source=` id already exists in the target file with a different shape and `--refresh` is not set.
- A candidate block, after passing the intent-only checklist, would be empty.
- The user explicitly asked for content that is fact-layer in nature (e.g., "summarize this repo's architecture into spec.md"). The skill is the wrong tool for that; recommend a code-reading agent instead.

In all refusal cases, report the reason in the per-file summary and continue with the remaining writes.
