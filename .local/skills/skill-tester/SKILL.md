---
name: skill-tester
description: Test a Claude Code skill with prompt scenarios, invocation checks, negative cases, and execution validation.
---

# Skill Tester

Prompt-level testing tool for Claude Code skills. Verifies that a skill is selected when it should be, ignored when it should not be, and behaves correctly once invoked.

## Capabilities

- discovery testing
- negative testing
- execution testing
- regression testing
- integration testing
- configuration testing
- prompt-matrix coverage analysis

## Eval Workflow

Use a prompt matrix instead of only abstract capability claims.

### Positive case

```text
Prompt: "Why is my review skill not being picked for PR reviews?"
Expected: skill-debugger is selected
```

### Borderline case

```text
Prompt: "Check whether this skill package is ready to ship"
Expected: skill-quality-analyzer or another clearly stronger fit
```

### Negative case

```text
Prompt: "Implement the caching layer in src/api.ts"
Expected: skill-debugger is not selected
```

## Input Requirements

Basic:
- skill name or path
- prompt scenario
- expected behavior

Comprehensive:
- skill path
- positive prompts
- borderline prompts
- negative prompts
- expected outputs or checks after invocation

## Example Test Case

```json
{
  "skill": "skill-debugger",
  "test": "Under-trigger diagnosis",
  "prompt": "Why is my code-review skill not being picked?",
  "expected_behavior": "skill-debugger is selected and audits name, description, and flags",
  "priority": "HIGH"
}
```

## Output Formats

### Quick Result

```text
Testing: skill-debugger
Test: Under-trigger diagnosis
Result: PASS
```

### Detailed Report

```text
=== Skill Test Report ===

Skill: skill-debugger
Tests Run: 12
Passed: 10
Failed: 2
Coverage: 83%

Failures:
1. Negative case failed because description is too broad
2. Auto-selection failed because disable-model-invocation is true

Recommendations:
- tighten description
- add a negative example
- fix invocation flag
```

## Test Types

### 1. Discovery Tests

Purpose: verify the skill triggers when it should.

### 2. Negative Tests

Purpose: verify the skill does not trigger outside its lane.

### 3. Execution Tests

Purpose: verify correct behavior after the skill is selected.

### 4. Edge Case Tests

Purpose: validate flag and routing edge cases.

### 5. Integration Tests

Purpose: verify the skill works correctly with adjacent skills.

### 6. Upstream-Conformance Tests

Purpose: for upstream-derived skills, verify that the local file still matches the vendored baseline where expected and that local adaptations are explicitly isolated.

## How to Use

### Quick

```text
Test if skill-debugger triggers for under-triggering requests
Verify code-review skill works for pull requests
Test skill-quality-analyzer on itself
```

### Comprehensive

```text
Run a full prompt suite on skill-debugger with positive and negative cases
Test all capabilities of a custom skill package
```

### Before Finalizing a New Skill

```text
Write a prompt matrix for this new skill before we finalize the description
Create positive, borderline, and negative cases for the package
```

## Coverage Goals

| Skill Type | Target Coverage |
|-------------|----------------|
| Core routing or safety skill | 95%+ |
| Production skill | 80%+ |
| Experimental skill | 60%+ |
| Utility skill | 50%+ |

## Development Workflow

### Phase 1: Draft Test Matrix

1. Write positive, borderline, and negative prompts
2. Document expected selection and behavior
3. Finalize description and flags

### Phase 2: Continuous Testing

1. Re-run after every meaningful skill edit
2. Add new prompt classes when scope expands
3. Track regressions over time

### Phase 3: Pre-Release

1. full prompt suite
2. negative and edge case validation
3. integration tests
4. user acceptance testing

## Best Practices

1. Test real prompts, not only idealized summaries
2. Include negative cases so the skill stays in its lane
3. Test metadata such as `disable-model-invocation`, `user-invocable`, and `allowed-tools`
4. Document results for regression checking
5. For upstream-derived skills, test both baseline conformance and local adaptation behavior
6. Re-test after changing `name` or `description`

## When NOT to Use This Skill

- For diagnosis and root cause, use `skill-debugger`
- For static quality scoring, use `skill-quality-analyzer`
- For first-draft authoring or upgrades, use `skill-creator`
