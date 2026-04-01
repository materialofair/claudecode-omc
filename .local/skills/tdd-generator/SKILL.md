---
name: tdd-generator
description: Test-driven workflow for unit, component, and E2E testing. Enforces Red-Green-Refactor and generates the right test type for changed code.
---

# TDD Generator

Use this skill to drive implementation through tests first.

## Workflow

1. Detect target type:
   - Pure logic -> unit tests
   - UI behavior -> component/integration tests
   - User journeys -> E2E tests
2. RED:
   - Write failing test first
3. GREEN:
   - Implement minimal code to pass
4. REFACTOR:
   - Improve structure while keeping tests green
5. Add regression cases for discovered bugs and edges.

## Recommended Stack

- Unit/component: Vitest + Testing Library
- E2E: Playwright

## E2E Agent Option

For large journey suites, you can run Playwright test agents:

```bash
npx playwright test --init-agents
npx playwright test --agent=planner
npx playwright test --agent=generator
npx playwright test --agent=healer --repeat
```

## Quality Rules

- Test behavior, not private implementation details.
- Prefer semantic queries (`getByRole`, `getByLabelText`) for UI tests.
- Keep one assertion intent per test case.
- Add explicit edge cases and failure-path coverage.

## References

- Playwright best practices: https://playwright.dev/docs/best-practices
- Vitest guide: https://vitest.dev/guide/

