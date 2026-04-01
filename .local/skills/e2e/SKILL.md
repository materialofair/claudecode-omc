---
name: e2e
description: Playwright end-to-end orchestration for critical user journeys, artifact capture, flaky-test isolation, and CI-ready reporting.
---

# E2E

Use this as the top-level end-to-end testing orchestrator.

## Use When

- Validating cross-layer user journeys
- Preparing release confidence checks
- Reproducing user-facing regressions

## Workflow

1. Define critical journeys and acceptance assertions.
2. Generate or update Playwright tests.
3. Run targeted tests first, then broader suites.
4. Capture artifacts (trace/screenshot/video/report).
5. Identify flakes and quarantine when needed.

## Playwright Best Practices

- Test user-visible behavior and assertions.
- Keep tests isolated and deterministic.
- Prefer resilient locators (`getByRole`, `getByLabelText`, `getByText`).
- Use web-first assertions and auto-waiting.
- Mock or isolate third-party dependencies when they are not under test.

## Suggested Config

```ts
// playwright.config.ts
use: {
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
},
retries: process.env.CI ? 2 : 0
```

## Electron Routing

If the target is an Electron app, use `/oh-my-claudecode:electron-driver` as the runtime backend while keeping Playwright assertions and artifacts.

## References

- Best practices: https://playwright.dev/docs/best-practices
- Actionability / auto-waiting: https://playwright.dev/docs/actionability
- Trace viewer: https://playwright.dev/docs/trace-viewer
- Retries and flaky handling: https://playwright.dev/docs/test-retries
- Codegen: https://playwright.dev/docs/codegen-intro

