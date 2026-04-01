---
name: electron-driver
description: Playwright-based E2E driving for Electron applications using launch mode or attach mode with robust window selection and runtime inspection.
---

# Electron Driver

Use this skill for Electron runtime automation and debugging.

## Modes

- Launch mode (preferred for clean CI runs)
- Attach mode (preferred for debugging existing sessions)

## Prerequisites

```bash
pnpm add -D playwright-core @playwright/test
```

## Launch Mode (recommended)

```ts
import { _electron as electron } from 'playwright';

const electronApp = await electron.launch({ args: ['.'] });
const page = await electronApp.firstWindow();
```

Use locators on `page` for UI actions and assertions.

## Attach Mode

- Start Electron with `--remote-debugging-port=<port>`
- Connect via CDP and pick the non-`devtools://` page

Template: `skills/electron-driver/scripts/driver-template.js`

## Best Practices

- Filter out DevTools pages before interaction.
- Use role/text-based locators for resilience.
- Keep launch mode for stable regression suites.
- Use attach mode for live bug reproduction.
- Capture trace/screenshot artifacts for failures.

## References

- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Electron automated testing: https://www.electronjs.org/docs/latest/tutorial/automated-testing

