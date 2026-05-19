#!/usr/bin/env node
/**
 * detect-stack.mjs — Stage 0: H5 stack detection + v1 scope gate
 *
 * Usage:
 *   node detect-stack.mjs <h5-src> [--out <dir>]
 *
 * Outputs:
 *   <h5-src>/stack-report.json  (or --out dir)
 *
 * Exit codes:
 *   0  — report written (check in_v1_scope for gate result)
 *   1  — fatal error (bad args, unreadable source)
 *
 * Examples:
 *   node detect-stack.mjs ./my-app
 *   node detect-stack.mjs ./my-app --out ./artifacts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`detect-stack.mjs — H5 stack detection and v1 scope gate

Usage:
  node detect-stack.mjs <h5-src> [--out <dir>]

Arguments:
  <h5-src>      Path to the H5 project root (required)
  --out <dir>   Directory to write stack-report.json (default: <h5-src>)

Exit codes:
  0  Report written (check in_v1_scope field for gate result)
  1  Fatal error

Output schema (stack-report.json):
  {
    "schema": "h5-to-swiftui/stack@1",
    "framework":   "vanilla" | "react" | "vue" | "angular" | "svelte" | "unknown",
    "buildTool":   "vite" | "webpack" | "parcel" | "rollup" | "none" | "unknown",
    "styling":     "tailwind" | "css-modules" | "styled-components" | "emotion" | "sass" | "plain-css" | "unknown",
    "router":      "react-router" | "vue-router" | "tanstack-router" | "history" | "none" | "unknown",
    "confidence":  0.0–1.0,
    "in_v1_scope": true | false
  }

Examples:
  node detect-stack.mjs ./my-vanilla-app
  node detect-stack.mjs ./my-react-app --out ./artifacts
`);
  process.exit(0);
}

if (args.length === 0 || args[0].startsWith('--')) {
  console.error('Error: <h5-src> is required.\nRun with --help for usage.');
  process.exit(1);
}

const h5Src = resolve(args[0]);
let outDir = h5Src;

const outIdx = args.indexOf('--out');
if (outIdx !== -1) {
  if (!args[outIdx + 1]) {
    console.error('Error: --out requires a directory argument.');
    process.exit(1);
  }
  outDir = resolve(args[outIdx + 1]);
}

if (!existsSync(h5Src)) {
  console.error(`Error: h5-src path does not exist: ${h5Src}`);
  process.exit(1);
}

if (!statSync(h5Src).isDirectory()) {
  console.error(`Error: h5-src must be a directory, got: ${h5Src}`);
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function readText(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

/**
 * Recursively collect file paths up to maxDepth, skipping heavy dirs.
 */
function collectFiles(dir, maxDepth = 4, _depth = 0) {
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage']);
  if (_depth > maxDepth) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectFiles(full, maxDepth, _depth + 1));
    } else {
      results.push(full);
    }
  }
  return results;
}

function fileContains(path, patterns) {
  const text = readText(path);
  if (!text) return false;
  return patterns.some(p => (typeof p === 'string' ? text.includes(p) : p.test(text)));
}

// ── detection ────────────────────────────────────────────────────────────────

const pkgPath = join(h5Src, 'package.json');
const pkg = readJson(pkgPath);
const allDeps = Object.assign({}, pkg?.dependencies, pkg?.devDependencies, pkg?.peerDependencies);
const depNames = new Set(Object.keys(allDeps));

const files = collectFiles(h5Src);
const srcFiles = files.filter(f => /\.(js|jsx|ts|tsx|mjs|cjs|html|css|scss|sass|vue|svelte)$/.test(f));

// Helper: match dep name prefix or contains
const hasDep = (...names) => names.some(n => depNames.has(n) || [...depNames].some(k => k.startsWith(n)));

// ── Framework ────────────────────────────────────────────────────────────────

let framework = 'unknown';
let frameworkConf = 0;

const signals = { react: 0, vue: 0, angular: 0, svelte: 0, vanilla: 0 };

// Dep-based signals
if (hasDep('react', 'react-dom', 'react-scripts', 'next')) { signals.react += 3; }
if (hasDep('vue', '@vue/core', 'nuxt')) { signals.vue += 3; }
if (hasDep('@angular/core', '@angular/common')) { signals.angular += 3; }
if (hasDep('svelte', '@sveltejs/kit')) { signals.svelte += 3; }

// Source-based signals — sample up to 60 files to keep it fast
const sample = srcFiles.slice(0, 60);
for (const f of sample) {
  const t = readText(f) ?? '';
  if (/from ['"]react['"]|require\(['"]react['"]\)|jsx|\.tsx?$/.test(t)) signals.react += 1;
  if (/from ['"]vue['"]|<template>|\.vue$/.test(t) || f.endsWith('.vue')) signals.vue += 1;
  if (/@Component\(|@NgModule\(|platformBrowserDynamic/.test(t)) signals.angular += 1;
  if (/from ['"]svelte['"]|<script.*svelte|\.svelte$/.test(t) || f.endsWith('.svelte')) signals.svelte += 1;
}

// HTML-only / no framework
const hasHtmlEntry = files.some(f => f.endsWith('.html'));
const hasNoJsFrameworkDep = !hasDep('react', 'vue', '@angular', 'svelte');
if (hasHtmlEntry && hasNoJsFrameworkDep) signals.vanilla += 1;
// Extra: if package.json missing entirely, lean vanilla
if (!pkg) signals.vanilla += 2;

const topSignal = Object.entries(signals).sort((a, b) => b[1] - a[1])[0];
const totalSignals = Object.values(signals).reduce((s, v) => s + v, 0);

if (topSignal[1] === 0 && hasHtmlEntry) {
  framework = 'vanilla';
  frameworkConf = 0.5;
} else if (topSignal[1] > 0) {
  framework = topSignal[0];
  frameworkConf = Math.min(0.95, totalSignals > 0 ? topSignal[1] / Math.max(totalSignals, 1) * 1.5 : 0.3);
  if (framework === 'vanilla') frameworkConf = Math.min(0.8, frameworkConf);
}

// ── Build tool ───────────────────────────────────────────────────────────────

let buildTool = 'unknown';
let buildConf = 0;

if (hasDep('vite') || files.some(f => /vite\.config\.(js|ts|mjs)$/.test(f))) {
  buildTool = 'vite'; buildConf = 0.95;
} else if (hasDep('webpack') || files.some(f => /webpack\.config\.(js|ts)$/.test(f))) {
  buildTool = 'webpack'; buildConf = 0.9;
} else if (hasDep('parcel')) {
  buildTool = 'parcel'; buildConf = 0.9;
} else if (hasDep('rollup') || files.some(f => /rollup\.config\.(js|ts|mjs)$/.test(f))) {
  buildTool = 'rollup'; buildConf = 0.85;
} else if (hasDep('react-scripts')) {
  buildTool = 'webpack'; buildConf = 0.8; // CRA uses webpack
} else if (!pkg) {
  buildTool = 'none'; buildConf = 0.7;
} else {
  buildTool = 'none'; buildConf = 0.4;
}

// ── Styling ──────────────────────────────────────────────────────────────────

let styling = 'unknown';
let stylingConf = 0;

const stylingSignals = { tailwind: 0, 'css-modules': 0, 'styled-components': 0, emotion: 0, sass: 0, 'plain-css': 0 };

if (hasDep('tailwindcss') || files.some(f => /tailwind\.config\.(js|ts|cjs|mjs)$/.test(f))) {
  stylingSignals.tailwind += 3;
}
if (hasDep('styled-components')) stylingSignals['styled-components'] += 3;
if (hasDep('@emotion/react', '@emotion/styled', 'emotion')) stylingSignals.emotion += 3;
if (hasDep('sass', 'node-sass', 'sass-loader') || srcFiles.some(f => /\.(scss|sass)$/.test(f))) {
  stylingSignals.sass += 2;
}

// CSS modules check: look for *.module.css imports
const cssModuleHit = sample.some(f => fileContains(f, [/\.module\.css['"]/, /\.module\.scss['"]/]));
if (cssModuleHit) stylingSignals['css-modules'] += 3;

const hasCss = srcFiles.some(f => f.endsWith('.css'));
if (hasCss) stylingSignals['plain-css'] += 1;

const topStyle = Object.entries(stylingSignals).sort((a, b) => b[1] - a[1])[0];
if (topStyle[1] > 0) {
  styling = topStyle[0];
  stylingConf = Math.min(0.95, 0.5 + topStyle[1] * 0.1);
} else {
  styling = 'plain-css';
  stylingConf = 0.3;
}

// ── Router ───────────────────────────────────────────────────────────────────

let router = 'none';
let routerConf = 0.6;

if (hasDep('react-router', 'react-router-dom')) { router = 'react-router'; routerConf = 0.95; }
else if (hasDep('@tanstack/react-router', '@tanstack/router')) { router = 'tanstack-router'; routerConf = 0.95; }
else if (hasDep('vue-router')) { router = 'vue-router'; routerConf = 0.95; }
else if (hasDep('history')) { router = 'history'; routerConf = 0.85; }
else {
  // Check source for router usage
  const routerUsage = sample.some(f =>
    fileContains(f, ['BrowserRouter', 'HashRouter', 'createBrowserRouter', 'useNavigate', 'useRouter'])
  );
  if (routerUsage) { router = 'react-router'; routerConf = 0.6; }
  else { router = 'none'; routerConf = 0.7; }
}

// ── Aggregate confidence ──────────────────────────────────────────────────────

const confidence = Math.round(
  (frameworkConf * 0.5 + buildConf * 0.2 + stylingConf * 0.15 + routerConf * 0.15) * 100
) / 100;

// ── v1 scope gate ────────────────────────────────────────────────────────────

const V1_FRAMEWORKS = new Set(['vanilla', 'react']);
const inV1Scope = V1_FRAMEWORKS.has(framework);

// ── Write report ─────────────────────────────────────────────────────────────

const report = {
  schema: 'h5-to-swiftui/stack@1',
  framework,
  buildTool,
  styling,
  router,
  confidence,
  in_v1_scope: inV1Scope,
};

// Ensure outDir exists
try {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });
} catch (e) {
  console.error(`Error: cannot create output directory ${outDir}: ${e.message}`);
  process.exit(1);
}

const reportPath = join(outDir, 'stack-report.json');
try {
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
} catch (e) {
  console.error(`Error: cannot write ${reportPath}: ${e.message}`);
  process.exit(1);
}

// ── Output ───────────────────────────────────────────────────────────────────

console.log(`Stack detection complete → ${reportPath}`);
console.log(JSON.stringify(report, null, 2));

if (!inV1Scope) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  STOP — framework "${framework}" is outside v1 scope.             `);
  console.log('║  v1 supports: vanilla, react only.                           ');
  console.log('║  Conversion pipeline will NOT proceed.                       ');
  console.log('║  stack-report.json written with in_v1_scope: false.          ');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

process.exit(0);
