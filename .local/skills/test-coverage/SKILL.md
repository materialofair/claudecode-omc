---
name: test-coverage
description: Analyze coverage, prioritize untested risk hotspots, generate missing tests, and verify threshold improvements.
---

# Test Coverage

Use this skill to close meaningful coverage gaps, not just raise percentages.

## Workflow

1. Run coverage:
   - `pnpm test --coverage` or `npx vitest run --coverage`
2. Parse summary and rank low-coverage files by risk:
   - Business-critical logic
   - Error handling paths
   - Security-sensitive branches
3. Generate targeted tests:
   - Unit for pure functions
   - Integration for service/API boundaries
   - E2E for critical user journeys
4. Re-run coverage and report before/after delta.

## Coverage Rules

- Use thresholds per project policy; default target can start at 80%.
- Cover meaningful branches and failure modes, not only statements.
- Exclude generated/build/vendor files explicitly.
- Enable all-file analysis when feasible to avoid hidden zero-coverage files.

## Vitest Guidance

- Default provider is V8; use Istanbul if project requires instrumentation parity.
- Configure `coverage.include`, `coverage.exclude`, and `coverage.thresholds`.

## References

- Vitest coverage guide: https://vitest.dev/guide/coverage.html
- Vitest coverage config: https://vitest.dev/config/#coverage

