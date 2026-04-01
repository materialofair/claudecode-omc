---
name: bdd-generator
description: Generate and maintain BDD scenarios and step definitions using Gherkin plus playwright-bdd with a one-scenario-at-a-time TDD loop.
---

# BDD Generator

Use this skill to translate business requirements into executable BDD scenarios.

## Use When

- The user asks for BDD, Gherkin, feature files, or scenario-based tests
- You need business-readable acceptance tests tied to Playwright execution

## Setup

```bash
pnpm add -D @playwright/test playwright-bdd
npx playwright install
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'features/steps/**/*.ts',
});

export default defineConfig({ testDir });
```

## Workflow

1. Write one feature and one scenario first (RED).
2. Run `bddgen` to generate missing step stubs.
3. Implement only the first failing step.
4. Re-run tests; repeat until scenario passes.
5. Add next scenario only after green.

## Gherkin Best Practices

- Use business language, not technical implementation details.
- `Given` sets context, `When` describes action, `Then` verifies user-visible outcome.
- Use `Background` for repeated context.
- Use `Scenario Outline` for data variants.

## Output

- `*.feature` file with clear business behavior
- Step definitions in `features/steps/*.ts`
- Command list to run and debug tests

## References

- Cucumber Gherkin reference: https://cucumber.io/docs/gherkin/reference
- playwright-bdd: https://github.com/vitalets/playwright-bdd

