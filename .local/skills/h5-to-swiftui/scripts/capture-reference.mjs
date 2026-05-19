#!/usr/bin/env node
/**
 * capture-reference.mjs — Stage 2: Playwright reference screenshot capture
 *
 * Usage:
 *   node capture-reference.mjs <h5-url-or-build> --device "iPhone 15 Pro" --out <dir>
 *                              [--screen <name>] [--mask x,y,w,h] [--settle-ms <ms>]
 *
 * Outputs under <dir>/reference/:
 *   <screen>/full.png          — full-page screenshot (animations frozen)
 *   <screen>/<component>.png   — per-landmark crops by getBoundingClientRect()
 *   manifest.json              — schema:"h5-to-swiftui/reference@1", device, logical_size,
 *                                screens:[{name,components:[{name,bbox_css_px,selector}]}], masks
 *
 * Exit codes:
 *   0  — screenshots written, manifest.json produced
 *   1  — fatal error (bad args, navigation failed)
 *   2  — playwright not installed (actionable hint printed)
 *
 * Examples:
 *   node capture-reference.mjs http://localhost:5173 --device "iPhone 15 Pro" --out ./artifacts
 *   node capture-reference.mjs http://localhost:5173 --device "iPhone 15 Pro" --out ./artifacts --screen home --mask 0,0,393,50
 *   node capture-reference.mjs http://localhost:5173 --device "iPhone 15 Pro" --out ./artifacts --settle-ms 1500
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Device profiles (logical px, deviceScaleFactor) ──────────────────────────

const DEVICES = {
  'iPhone 15 Pro': { width: 393, height: 852, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'iPhone 14 Pro': { width: 393, height: 852, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  'iPhone 15':     { width: 390, height: 844, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'iPhone SE':     { width: 375, height: 667, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
};

// Landmark selectors for per-component crops
const LANDMARK_SELECTORS = [
  { name: 'nav',     selector: 'nav, [role="navigation"]' },
  { name: 'header',  selector: 'header, [role="banner"]' },
  { name: 'main',    selector: 'main, [role="main"]' },
  { name: 'footer',  selector: 'footer, [role="contentinfo"]' },
  { name: 'hero',    selector: '[class*="hero"], [class*="banner"], [class*="jumbotron"]' },
  { name: 'cta',     selector: '[class*="cta"], [class*="call-to-action"]' },
  { name: 'card',    selector: '[class*="card"]:first-of-type' },
  { name: 'list',    selector: 'ul:first-of-type, ol:first-of-type, [class*="list"]:first-of-type' },
  { name: 'form',    selector: 'form:first-of-type' },
  { name: 'button',  selector: 'button:first-of-type, [class*="btn"]:first-of-type' },
];

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`capture-reference.mjs — Stage 2 Playwright reference capture

Usage:
  node capture-reference.mjs <h5-url-or-build> --device "iPhone 15 Pro" --out <dir>
                             [--screen <name>] [--mask x,y,w,h] [--settle-ms <ms>]

Arguments:
  <h5-url-or-build>        Running URL (http://...) or build directory
  --device <name>          Device profile (required)
  --out <dir>              Output directory (required)
  --screen <name>          Screen name for the manifest (default: "main")
  --mask x,y,w,h           Mask rectangle in CSS px — repeatable
  --settle-ms <ms>         Additional settle delay after networkidle (default: 300)

Supported devices:
  "iPhone 15 Pro"   393×852 @3x  (default)
  "iPhone 14 Pro"   393×852 @3x
  "iPhone 15"       390×844 @3x
  "iPhone SE"       375×667 @2x

Prerequisites:
  playwright must be installed:
    npm install --save-dev playwright && npx playwright install chromium

Outputs:
  <out>/reference/<screen>/full.png           Full-page screenshot
  <out>/reference/<screen>/<component>.png    Per-landmark crops
  <out>/reference/manifest.json               Capture manifest

Exit codes:
  0  Success
  1  Fatal error (bad args / navigation failed)
  2  playwright not installed

Examples:
  node capture-reference.mjs http://localhost:5173 --device "iPhone 15 Pro" --out ./artifacts
  node capture-reference.mjs http://localhost:5173 --device "iPhone 15 Pro" --out ./artifacts \\
      --screen home --mask 0,0,393,50 --settle-ms 1000
`);
  process.exit(0);
}

// Parse positional: first non-flag arg
let h5Target = null;
for (const a of args) {
  if (!a.startsWith('--')) { h5Target = a; break; }
}

if (!h5Target) {
  console.error('Error: <h5-url-or-build> is required.\nRun with --help for usage.');
  process.exit(1);
}

function getFlag(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const val = args[idx + 1];
  if (!val || val.startsWith('--')) {
    console.error(`Error: ${flag} requires an argument.`);
    process.exit(1);
  }
  return val;
}

function getAllFlags(flag) {
  const results = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith('--')) {
      results.push(args[i + 1]);
    }
  }
  return results;
}

const deviceName = getFlag('--device', 'iPhone 15 Pro');
const outDirRaw = getFlag('--out');
const screenName = getFlag('--screen', 'main');
const settleMsRaw = getFlag('--settle-ms', '300');
const maskStrings = getAllFlags('--mask');

if (!outDirRaw) {
  console.error('Error: --out <dir> is required.\nRun with --help for usage.');
  process.exit(1);
}

const outDir = resolve(outDirRaw);
const settleMs = parseInt(settleMsRaw, 10);

if (isNaN(settleMs) || settleMs < 0) {
  console.error(`Error: --settle-ms must be a non-negative integer, got: ${settleMsRaw}`);
  process.exit(1);
}

const device = DEVICES[deviceName];
if (!device) {
  console.error(`Error: unknown device "${deviceName}".\nSupported: ${Object.keys(DEVICES).map(d => `"${d}"`).join(', ')}`);
  process.exit(1);
}

// Parse mask strings: "x,y,w,h"
const masks = [];
for (const ms of maskStrings) {
  const parts = ms.split(',').map(p => parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.error(`Error: --mask must be "x,y,w,h" (CSS px), got: "${ms}"`);
    process.exit(1);
  }
  masks.push({ x: parts[0], y: parts[1], w: parts[2], h: parts[3] });
}

// Resolve URL: if it looks like a path, serve via file URL or note static serve needed
let targetUrl = h5Target;
if (!h5Target.startsWith('http://') && !h5Target.startsWith('https://')) {
  const absPath = resolve(h5Target);
  if (!existsSync(absPath)) {
    console.error(`Error: path "${h5Target}" does not exist. Provide a running URL or an existing build directory.`);
    process.exit(1);
  }
  // For a directory, construct a file URL to index.html — may not work for all apps
  const indexHtml = join(absPath, 'index.html');
  if (!existsSync(indexHtml)) {
    console.error(`Error: no index.html found in "${absPath}". Start a dev server and pass its URL instead.`);
    process.exit(1);
  }
  targetUrl = `file://${indexHtml}`;
  console.warn(`Warning: using file:// URL. Some apps may require a running dev server for correct rendering.`);
}

// ── Playwright check ──────────────────────────────────────────────────────────

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error(
    '\nError: playwright is not installed. capture-reference.mjs requires it.\n\n' +
    'Install with:\n' +
    '  npm install --save-dev playwright && npx playwright install chromium\n\n' +
    'Then re-run this script.'
  );
  process.exit(2);
}

// ── Setup output dirs ─────────────────────────────────────────────────────────

const refDir = join(outDir, 'reference');
const screenDir = join(refDir, screenName);
mkdirSync(screenDir, { recursive: true });

// ── Browser launch + capture ──────────────────────────────────────────────────

console.log(`Device:  ${deviceName} (${device.width}×${device.height} @${device.deviceScaleFactor}x)`);
console.log(`URL:     ${targetUrl}`);
console.log(`Output:  ${screenDir}`);
console.log(`Masks:   ${masks.length} region(s)`);
console.log(`Settle:  ${settleMs}ms`);

const { chromium } = playwright;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: device.width, height: device.height },
  deviceScaleFactor: device.deviceScaleFactor,
  userAgent: device.userAgent,
  colorScheme: 'light',
});

const page = await context.newPage();

// ── Freeze animations per render-equivalence-calibration.md ──────────────────

await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(style);
});

// Navigate
console.log(`\nNavigating...`);
try {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60_000 });
} catch (e) {
  await browser.close();
  console.error(`Error: navigation failed: ${e.message}`);
  process.exit(1);
}

// Wait for fonts (render-equivalence-calibration.md: webfont/async settle)
try {
  await page.waitForFunction(() => document.fonts.ready, { timeout: 10_000 });
} catch {
  console.warn('Warning: fonts.ready timed out — continuing');
}

// Additional settle
if (settleMs > 0) {
  await new Promise(r => setTimeout(r, settleMs));
}

// Inject animation freeze again after page load (catches dynamically added styles)
await page.addStyleTag({
  content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
});

// ── Apply masks (draw opaque rects over sensitive regions) ───────────────────

if (masks.length > 0) {
  await page.evaluate((maskList) => {
    for (const m of maskList) {
      const div = document.createElement('div');
      Object.assign(div.style, {
        position: 'fixed',
        left: `${m.x}px`,
        top: `${m.y}px`,
        width: `${m.w}px`,
        height: `${m.h}px`,
        background: '#000',
        zIndex: '2147483647',
        pointerEvents: 'none',
      });
      document.body.appendChild(div);
    }
  }, masks);
}

// ── Full-page screenshot ──────────────────────────────────────────────────────

const fullPath = join(screenDir, 'full.png');
await page.screenshot({ path: fullPath, fullPage: true });
console.log(`\nFull screenshot: ${fullPath}`);

// ── Per-component crops ───────────────────────────────────────────────────────

const components = [];

for (const { name: compName, selector } of LANDMARK_SELECTORS) {
  let bbox = null;
  try {
    bbox = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, selector);
  } catch {
    continue;
  }

  if (!bbox || bbox.width <= 0 || bbox.height <= 0) continue;

  // Clip must be within the logical viewport
  const clip = {
    x: Math.max(0, Math.floor(bbox.x)),
    y: Math.max(0, Math.floor(bbox.y)),
    width: Math.min(device.width - Math.max(0, Math.floor(bbox.x)), Math.ceil(bbox.width)),
    height: Math.min(device.height - Math.max(0, Math.floor(bbox.y)), Math.ceil(bbox.height)),
  };

  if (clip.width <= 0 || clip.height <= 0) continue;

  const compPath = join(screenDir, `${compName}.png`);
  try {
    await page.screenshot({ path: compPath, clip });
    console.log(`  Component "${compName}": bbox=${JSON.stringify(bbox)} → ${compPath}`);
    components.push({
      name: compName,
      bbox_css_px: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
      selector,
      file: `${screenName}/${compName}.png`,
    });
  } catch (e) {
    console.warn(`  Warning: could not crop "${compName}": ${e.message}`);
  }
}

await browser.close();

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifestPath = join(refDir, 'manifest.json');

// Load existing manifest if present (multiple screen runs)
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  manifest = {
    schema: 'h5-to-swiftui/reference@1',
    device: deviceName,
    logical_size: [device.width, device.height],
    device_scale_factor: device.deviceScaleFactor,
    screens: [],
    masks: [],
  };
}

// Update masks list (union)
for (const m of masks) {
  const dup = manifest.masks.some(e => e.x === m.x && e.y === m.y && e.w === m.w && e.h === m.h);
  if (!dup) manifest.masks.push(m);
}

// Update or append screen entry
const existingIdx = manifest.screens.findIndex(s => s.name === screenName);
const screenEntry = {
  name: screenName,
  full_screenshot: `${screenName}/full.png`,
  components,
  captured_at: new Date().toISOString(),
  settle_ms: settleMs,
};

if (existingIdx !== -1) {
  manifest.screens[existingIdx] = screenEntry;
} else {
  manifest.screens.push(screenEntry);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\nManifest: ${manifestPath}`);
console.log(`  Screens: ${manifest.screens.length}, components this run: ${components.length}`);
console.log('\nCapture complete.');
process.exit(0);
