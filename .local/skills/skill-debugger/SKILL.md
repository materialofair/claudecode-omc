---
name: skill-debugger
description: Diagnose why a Claude Code skill is under-triggering, over-triggering, undiscoverable, or misconfigured.
---

# Skill Debugger

Systematic debugging tool for Claude Code skills that are not being selected correctly or are behaving incorrectly once invoked. Focus on the current Claude Code skill model: `name` and `description` drive discovery, while optional metadata controls invocation and execution behavior.

## Workflow

1. Verify the package exists and the frontmatter parses.
2. Inspect the discovery surface.
   - Is the `name` distinct?
   - Does the `description` clearly say when to use the skill?
3. Inspect behavioral flags.
   - `disable-model-invocation`
   - `user-invocable`
   - `allowed-tools`
   - `model`, `context`, `agent`, `hooks`
4. Compare the skill against neighboring skills.
5. Run a prompt matrix: obvious positive, borderline positive, obvious negative.
6. Recommend the smallest change that explains the behavior.

## Capabilities

- Under-trigger analysis
- Over-trigger analysis
- Discovery debugging
- Configuration debugging
- Conflict detection
- YAML/frontmatter validation
- Prompt-matrix diagnosis
- Fix suggestions with smallest-change bias

## Common Failure Modes

### 1. Vague description

Symptom: skill exists but Claude almost never uses it.

```yaml
Bad: description: Helps with various tasks
Good: description: Review code for bugs, regressions, and missing tests.
```

### 2. Description too broad

Symptom: wrong skill triggers instead.

Fix: narrow the promise and make the boundary explicit.

### 3. Skill not discovered

Symptom: Claude Code says the skill does not exist.

Check:
- `~/.claude/skills/<name>/SKILL.md`
- project-local `.claude/skills/<name>/SKILL.md`

### 4. Name mismatch

Symptom: package exists but does not load correctly.

Fix: folder name and `name:` must match.

### 5. Metadata mismatch

Symptom: behavior is wrong after the skill loads.

Audit:
- `disable-model-invocation`
- `user-invocable`
- `allowed-tools`

## Output Formats

### Quick Diagnosis

```text
Skill: code-review
Status: not triggering
Root cause: description overlaps with broader review skill
Fix: tighten the description around review findings and regressions
```

### Detailed Report

```text
=== Skill Debugging Report ===

Skill: financial-analyzer
Path: ~/.claude/skills/financial-analyzer/
Status: rarely triggers

Issues Found:
1. [CRITICAL] Description is too broad
2. [HIGH] disable-model-invocation is blocking auto-selection
3. [MEDIUM] No negative boundary for generic analytics requests

Recommendations:
1. Rewrite description around investing workflows
2. Set disable-model-invocation: false if auto-selection is intended
3. Add a When NOT to Use section
```

## Prompt Matrix

Test three classes of prompts:

1. Obvious positive
   - "Why is my review skill not being picked for PR reviews?"
2. Borderline positive
   - "Check whether this skill package is ready to ship"
3. Obvious negative
   - "Implement the caching layer in src/api.ts"

## Systematic Questions

1. Installation
   - Does the skill package exist at the expected path?
   - Does `SKILL.md` parse correctly?
2. Discovery surface
   - Is the `name` distinct?
   - Does the `description` say when to use the skill?
   - Is the description specific enough to avoid overlap?
3. Behavior flags
   - Is `disable-model-invocation` suppressing auto-selection?
   - Is `user-invocable` blocking direct use?
   - Are `allowed-tools` too restrictive or too loose?
4. Content
   - Is there a `When to Use` or equivalent section?
   - Is there a `When NOT to Use` boundary?
   - Are positive and negative examples present?
5. Conflict
   - Which neighboring skills promise similar work?
   - Which skill actually won the routing decision?
6. Upstream drift
   - If the skill is based on a vendored upstream file, did local edits accidentally replace baseline guidance instead of adding explicit local adaptations?

## Common Fixes

### Fix 1: Rewrite the description

```yaml
Before: description: Helps with code analysis
After:  description: Review code for bugs, regressions, maintainability issues, and missing tests.
```

### Fix 2: Narrow the promise

Do not stuff many adjacent use cases into one description.

### Fix 3: Add a boundary

```markdown
## When NOT to Use

- For generic implementation work, use `executor`
- For scorecard-style audits, use `skill-quality-analyzer`
```

### Fix 4: Correct metadata

If the skill should auto-trigger, do not leave `disable-model-invocation: true`.

If the skill should be callable directly, do not leave `user-invocable: false`.

### Fix 5: Fix name mismatch

```text
Folder: ~/.claude/skills/code-review/
YAML:   name: code-review
```

### Fix 6: Re-isolate local adaptations

If the skill is derived from a vendored upstream baseline, keep baseline guidance intact and move project-specific behavior into clearly labeled local sections.

## Diagnostic Checklist

- [ ] skill file exists at the correct location
- [ ] `SKILL.md` has valid frontmatter
- [ ] folder name matches `name`
- [ ] `description` clearly states when to use the skill
- [ ] description distinguishes this skill from adjacent ones
- [ ] invocation flags match intended behavior
- [ ] positive and negative prompt checks behave as expected

## Integration

Recommended order:
1. `skill-creator` for authoring or structural revisions
2. `skill-quality-analyzer` for static issues
3. `skill-debugger` for routing/configuration issues
4. `skill-tester` for prompt-level verification

## Limitations

- Cannot inspect Claude's private internal routing logic
- Uses evidence and prompt-based inference
- Cannot auto-fix every issue

## Success Criteria

After fixes, the skill should:
- trigger for clear in-scope prompts
- stay quiet for clear out-of-scope prompts
- avoid being blocked by incorrect metadata
