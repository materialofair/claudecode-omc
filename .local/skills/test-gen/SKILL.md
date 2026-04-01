---
name: test-gen
description: Post-change intelligent test generation workflow that detects stack, analyzes changed files, and produces acceptance plus regression tests.
---

# Test Generation Workflow

Use this skill after code changes to generate the right tests quickly.

## Workflow

### Phase 1: Detect context

```bash
omc test detect-stack
omc test changed
omc test analyze path/to/file
```

Prefer `omc test changed` when the goal is to cover the current diff.

### Phase 2: Generate testing pack

```bash
omc test gen path/to/file
```

Expected artifacts:

- test plan
- acceptance checklist
- regression checklist

### Phase 3: Write or update tests

Choose test depth by risk:

- Pure logic -> unit tests
- UI behavior -> component/integration tests
- Async I/O or cross-boundary behavior -> integration tests
- Critical user flows -> E2E tests

### Phase 4: Verify

Run the smallest targeted test command first, then broaden if needed.

If higher orchestration is needed, combine with:

- `/oh-my-claudecode:tdd-generator`
- `/oh-my-claudecode:test-coverage`
- `/oh-my-claudecode:ultraqa`

## Rules

- Do not stop at happy-path-only coverage.
- Add regression assertions for risk signals.
- Avoid implementation-detail-only tests.
- If no safe automated test can be added, provide a concrete manual regression checklist.

## Output

Always report:

1. analyzed target files
2. generated/updated test files
3. acceptance items covered
4. regression items covered
5. commands executed
6. remaining gaps

