const { chromium } = require('playwright-core');

/**
 * Electron attach-mode template.
 *
 * Usage:
 * 1) Start Electron with --remote-debugging-port=<PORT>
 * 2) Optionally set CDP_PORT env var
 * 3) Run: node skills/electron-driver/scripts/driver-template.js
 */

const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;

async function run() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context found');

    const page = context.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('No Electron app page found');

    console.log(
      JSON.stringify({
        status: 'success',
        title: await page.title(),
        url: page.url(),
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'error',
        message: error.message,
      })
    );
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

run();

