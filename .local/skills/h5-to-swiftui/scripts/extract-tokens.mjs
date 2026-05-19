#!/usr/bin/env node
/**
 * extract-tokens.mjs — Stage 1: DTCG design token extraction
 *
 * Usage:
 *   node extract-tokens.mjs <h5-src> [--url <running-url>] [--out <dir>]
 *
 * Outputs:
 *   tokens.json      — W3C DTCG: { name: { $value, $type } }
 *   token-gaps.json  — values seen but not resolvable to a named token
 *
 * Exit codes:
 *   0  — tokens.json + token-gaps.json written
 *   1  — fatal error (bad args, unreadable source)
 *   2  — playwright requested but not installed (actionable hint printed)
 *
 * Examples:
 *   node extract-tokens.mjs ./my-app
 *   node extract-tokens.mjs ./my-app --url http://localhost:5173
 *   node extract-tokens.mjs ./my-app --url http://localhost:5173 --out ./artifacts
 */

import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`extract-tokens.mjs — H5 design token extraction (DTCG)

Usage:
  node extract-tokens.mjs <h5-src> [--url <running-url>] [--out <dir>]

Arguments:
  <h5-src>          Path to the H5 project root (required)
  --url <url>       Running dev-server URL; enables runtime Playwright pass
  --out <dir>       Directory for output files (default: <h5-src>)

Outputs:
  tokens.json       W3C DTCG — each token: { "$value": ..., "$type": ... }
  token-gaps.json   Values seen in source that couldn't be resolved to a token

Token types emitted:
  color | dimension | typography

Sources (in priority order):
  1. CSS custom properties (--* from .css / .scss)
  2. tailwind.config.* theme.colors / spacing / fontSize / borderRadius / fontFamily
  3. Runtime getComputedStyle via Playwright (only when --url given)

Note: Sass variables in .scss that haven't been precompiled to CSS are noted
in token-gaps.json. Playwright is an optional dependency — install it with:
  npm install --save-dev playwright && npx playwright install chromium

Exit codes:
  0  tokens.json + token-gaps.json written
  1  fatal error
  2  playwright missing (actionable hint printed, static tokens still written)

Examples:
  node extract-tokens.mjs ./my-vanilla-app
  node extract-tokens.mjs ./my-react-app --url http://localhost:5173
  node extract-tokens.mjs ./my-react-app --url http://localhost:5173 --out ./artifacts
`);
  process.exit(0);
}

if (args.length === 0 || args[0].startsWith('--')) {
  console.error('Error: <h5-src> is required.\nRun with --help for usage.');
  process.exit(1);
}

const h5Src = resolve(args[0]);

let runUrl = null;
const urlIdx = args.indexOf('--url');
if (urlIdx !== -1) {
  if (!args[urlIdx + 1] || args[urlIdx + 1].startsWith('--')) {
    console.error('Error: --url requires a URL argument.');
    process.exit(1);
  }
  runUrl = args[urlIdx + 1];
}

let outDir = h5Src;
const outIdx = args.indexOf('--out');
if (outIdx !== -1) {
  if (!args[outIdx + 1] || args[outIdx + 1].startsWith('--')) {
    console.error('Error: --out requires a directory argument.');
    process.exit(1);
  }
  outDir = resolve(args[outIdx + 1]);
}

if (!existsSync(h5Src)) {
  console.error(`Error: h5-src does not exist: ${h5Src}`);
  process.exit(1);
}
if (!statSync(h5Src).isDirectory()) {
  console.error(`Error: h5-src must be a directory: ${h5Src}`);
  process.exit(1);
}

// ── File helpers ─────────────────────────────────────────────────────────────

function readText(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function collectFiles(dir, exts, maxDepth = 5, _depth = 0) {
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage', '.cache']);
  if (_depth > maxDepth) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectFiles(full, exts, maxDepth, _depth + 1));
    } else if (exts.has(extname(e.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// ── Color utilities ──────────────────────────────────────────────────────────

function parseColor(val) {
  if (typeof val !== 'string') return null;
  val = val.trim();
  let m;

  // #rrggbbaa or #rrggbb
  m = val.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
  if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };

  // #rgba or #rgb
  m = val.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i);
  if (m) return { r: parseInt(m[1]+m[1], 16), g: parseInt(m[2]+m[2], 16), b: parseInt(m[3]+m[3], 16) };

  // rgb(r, g, b) or rgba(r, g, b, a)
  m = val.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]) };

  // rgb(r g b) — modern syntax
  m = val.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]) };

  return null;
}

function toLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToXyz({ r, g, b }) {
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    z: rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  };
}

function xyzToLab({ x, y, z }) {
  const fn = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = fn(x / 0.95047), fy = fn(y / 1.00000), fz = fn(z / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(c1, c2) {
  const lab1 = xyzToLab(rgbToXyz(c1)), lab2 = xyzToLab(rgbToXyz(c2));
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

function normalizeColor(val) {
  const rgb = parseColor(val);
  if (!rgb) return val.toLowerCase().trim();
  const hex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

function looksLikeColor(val) {
  if (typeof val !== 'string') return false;
  return /^#[0-9a-f]{3,8}$/i.test(val) ||
    /^rgba?\(/.test(val) ||
    /^hsla?\(/.test(val) ||
    /^(transparent|currentcolor|inherit)$/i.test(val);
}

function looksLikeDimension(val) {
  if (typeof val !== 'string') return false;
  return /^-?[\d.]+\s*(px|rem|em|vw|vh|dvh|dvw|pt|ch|ex|%)$/.test(val.trim());
}

// Deduplicate colors: for pairs with ΔE < 2, retain first, alias the rest
function dedupeColors(colorMap) {
  const result = {};
  const seen = [];
  for (const [name, val] of Object.entries(colorMap)) {
    const rgb = parseColor(val);
    if (!rgb) { result[name] = val; continue; }
    const dup = seen.find(s => s.rgb && deltaE(s.rgb, rgb) < 2);
    if (dup) {
      result[name] = { value: val, alias_of: dup.name };
    } else {
      result[name] = val;
      seen.push({ name, rgb });
    }
  }
  return result;
}

// ── Static pass: CSS custom properties ───────────────────────────────────────

const CSS_CUSTOM_PROP = /--([a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;

function extractCssCustomProps(cssText) {
  const props = {};
  let m;
  CSS_CUSTOM_PROP.lastIndex = 0;
  while ((m = CSS_CUSTOM_PROP.exec(cssText)) !== null) {
    const name = `--${m[1].trim()}`;
    const val = m[2].trim();
    if (val && !val.startsWith('/*')) props[name] = val;
  }
  return props;
}

function isVarRef(val) { return /^var\(--/.test(val); }

// ── Static pass: Sass variables ──────────────────────────────────────────────

const SASS_VAR = /^\s*\$([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*(!default)?;/gm;

function extractSassVars(scssText) {
  const vars = {};
  let m;
  SASS_VAR.lastIndex = 0;
  while ((m = SASS_VAR.exec(scssText)) !== null) {
    vars[`$${m[1]}`] = m[2].trim();
  }
  return vars;
}

// ── Static pass: Tailwind config ─────────────────────────────────────────────

const TW_THEME_KEYS = ['colors', 'spacing', 'fontSize', 'borderRadius', 'fontFamily'];

function flattenObject(obj, prefix = '', out = {}) {
  if (typeof obj === 'string' || typeof obj === 'number') {
    out[prefix] = String(obj); return out;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    if (Array.isArray(obj)) out[prefix] = obj.join(', ');
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    flattenObject(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function flattenTailwindTheme(theme) {
  const tokens = {};
  for (const key of TW_THEME_KEYS) {
    if (theme[key]) Object.assign(tokens, flattenObject(theme[key], `tw.${key}`));
    if (theme.extend?.[key]) Object.assign(tokens, flattenObject(theme.extend[key], `tw.${key}`));
  }
  return tokens;
}

function extractTailwindTokens(configText, configPath) {
  if (configPath.endsWith('.json')) {
    const obj = readJson(configPath);
    return obj?.theme ? flattenTailwindTheme(obj.theme) : {};
  }

  const themeStart = configText.indexOf('theme:');
  if (themeStart === -1) return {};
  const objStart = configText.indexOf('{', themeStart);
  if (objStart === -1) return {};

  let depth = 0, end = objStart;
  for (let i = objStart; i < configText.length; i++) {
    if (configText[i] === '{') depth++;
    else if (configText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const themeBlock = configText.slice(objStart, end + 1);

  const tokens = {};
  for (const key of TW_THEME_KEYS) {
    const keyRe = new RegExp(`['"]?${key}['"]?\\s*:\\s*\\{`);
    const km = keyRe.exec(themeBlock);
    if (!km) continue;

    const keyStart = km.index + km[0].length - 1;
    let d = 0, ke = keyStart;
    for (let i = keyStart; i < themeBlock.length; i++) {
      if (themeBlock[i] === '{') d++;
      else if (themeBlock[i] === '}') { d--; if (d === 0) { ke = i; break; } }
    }
    const block = themeBlock.slice(keyStart, ke + 1);

    try {
      const jsonLike = block
        .replace(/(['"])?([a-zA-Z0-9_-]+)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']+)'/g, ': "$1"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      const parsed = JSON.parse(jsonLike);
      Object.assign(tokens, flattenObject(parsed, `tw.${key}`));
    } catch {
      const kvRe = /['"]?([a-zA-Z0-9_.-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let kvm;
      while ((kvm = kvRe.exec(block)) !== null) {
        tokens[`tw.${key}.${kvm[1]}`] = kvm[2];
      }
    }
  }
  return tokens;
}

// ── Infer spacing scale ───────────────────────────────────────────────────────

function inferSpacingScale(tokens) {
  const dims = Object.entries(tokens)
    .filter(([, t]) => t.$type === 'dimension')
    .map(([, t]) => t.$value)
    .filter(v => /^[\d.]+px$/.test(v))
    .map(v => parseFloat(v))
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (dims.length < 2) return null;
  const gcd = (a, b) => b < 0.5 ? a : gcd(b, a % b);
  const base = Math.round(dims.reduce(gcd) * 10) / 10;
  return base >= 1 ? { base_px: base, unit: 'px', note: 'inferred from token set' } : null;
}

// ── Light/dark pairing ────────────────────────────────────────────────────────

function pairLightDark(tokens) {
  const pairs = {};
  for (const name of Object.keys(tokens)) {
    const darkVariant = name
      .replace(/(light|day)$/i, 'dark')
      .replace(/^(light|day)-/i, 'dark-');
    if (darkVariant !== name && tokens[darkVariant]) {
      pairs[name] = { light: tokens[name].$value, dark: tokens[darkVariant].$value };
    }
  }
  return pairs;
}

// ── Token type inference ──────────────────────────────────────────────────────

function toTokenType(name, val) {
  if (looksLikeColor(val)) return 'color';
  if (looksLikeDimension(val)) return 'dimension';
  const lname = name.toLowerCase();
  if (lname.includes('font-family') || lname.includes('fontfamily')) return 'typography';
  if (lname.includes('font-size') || lname.includes('fontsize')) return 'typography';
  return null;
}

// ── Main static extraction ────────────────────────────────────────────────────

console.log(`Scanning: ${h5Src}`);

const cssFiles  = collectFiles(h5Src, new Set(['.css']));
const scssFiles = collectFiles(h5Src, new Set(['.scss', '.sass']));
const twConfigFiles = collectFiles(h5Src, new Set(['.js', '.ts', '.mjs', '.cjs', '.json']))
  .filter(f => /tailwind\.config\./.test(basename(f)));

const rawTokens = {};
const gaps = [];

// 1. CSS custom properties
for (const f of cssFiles) {
  const text = readText(f);
  if (!text) continue;
  for (const [name, val] of Object.entries(extractCssCustomProps(text))) {
    if (isVarRef(val)) {
      gaps.push({ source: f, name, value: val, reason: 'unresolved var() reference at static analysis time' });
    } else {
      rawTokens[name] = val;
    }
  }
}

// 2. Sass files — extract custom props from compiled portions; note vars as gaps
for (const f of scssFiles) {
  const text = readText(f);
  if (!text) continue;
  for (const [name, val] of Object.entries(extractCssCustomProps(text))) {
    if (!isVarRef(val)) rawTokens[name] = val;
  }
  for (const [name, val] of Object.entries(extractSassVars(text))) {
    gaps.push({
      source: f, name, value: val,
      reason: 'Sass variable — precompile CSS to resolve; value noted but must not be silently inlined',
    });
  }
}

// 3. Tailwind config
for (const f of twConfigFiles) {
  const text = readText(f);
  if (!text) continue;
  for (const [name, val] of Object.entries(extractTailwindTokens(text, f))) {
    if (typeof val === 'string') rawTokens[name] = val;
  }
}

// ── Build DTCG tokens ─────────────────────────────────────────────────────────

const dtcgTokens = {};
const colorRaw = {};

for (const [name, val] of Object.entries(rawTokens)) {
  const type = toTokenType(name, val);
  if (!type) {
    gaps.push({ source: 'static', name, value: val, reason: 'type could not be inferred — not a recognized color/dimension/typography value' });
    continue;
  }
  if (type === 'color') {
    colorRaw[name] = normalizeColor(val);
  } else {
    dtcgTokens[name] = { $value: val, $type: type };
  }
}

for (const [name, entry] of Object.entries(dedupeColors(colorRaw))) {
  if (typeof entry === 'object' && entry.alias_of) {
    dtcgTokens[name] = { $value: entry.value, $type: 'color', $alias_of: entry.alias_of };
  } else {
    dtcgTokens[name] = { $value: entry, $type: 'color' };
  }
}

const spacingScale   = inferSpacingScale(dtcgTokens);
const lightDarkPairs = pairLightDark(dtcgTokens);

// ── Runtime pass via Playwright ───────────────────────────────────────────────

const LANDMARK_SELECTORS = [
  'body', 'h1', 'h2', 'h3', 'p', 'a', 'button',
  'input', 'label', 'nav', 'header', 'footer', 'main',
];

if (runUrl) {
  console.log(`\nRuntime pass: ${runUrl}`);

  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.error(
      '\nError: playwright is not installed. Runtime token extraction requires it.\n' +
      'Install with:\n' +
      '  npm install --save-dev playwright && npx playwright install chromium\n' +
      'Then re-run with --url to enable the runtime pass.\n' +
      '\nWriting static tokens collected so far.'
    );
    writeOutputFiles();
    process.exit(2);
  }

  const { chromium } = playwright;

  async function getRuntimeTokens(colorScheme) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      colorScheme,
      viewport: { width: 393, height: 852 },
    });
    const page = await ctx.newPage();
    try {
      await page.goto(runUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => document.fonts.ready, { timeout: 10_000 });

      const result = await page.evaluate((sels) => {
        const out = {};
        // Collect custom props declared in stylesheets
        const allProps = Array.from(document.styleSheets)
          .flatMap(ss => { try { return Array.from(ss.cssRules); } catch { return []; } })
          .flatMap(r => r.style ? Array.from(r.style) : [])
          .filter(p => p.startsWith('--'));

        const bodyStyle = window.getComputedStyle(document.body);
        for (const prop of allProps) {
          const v = bodyStyle.getPropertyValue(prop).trim();
          if (v) out[prop] = v;
        }

        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const cs = window.getComputedStyle(el);
          out[`_computed.${sel}.color`] = cs.color;
          out[`_computed.${sel}.backgroundColor`] = cs.backgroundColor;
          out[`_computed.${sel}.fontSize`] = cs.fontSize;
          out[`_computed.${sel}.fontFamily`] = cs.fontFamily;
        }
        return out;
      }, sels);
      return result;
    } finally {
      await browser.close();
    }
  }

  try {
    const [lightProps, darkProps] = await Promise.all([
      getRuntimeTokens('light'),
      getRuntimeTokens('dark'),
    ]);

    for (const [name, val] of Object.entries(lightProps)) {
      if (name.startsWith('--') && !dtcgTokens[name]) {
        const type = toTokenType(name, val);
        if (type) {
          const token = { $value: type === 'color' ? normalizeColor(val) : val, $type: type, $source: 'runtime' };
          if (darkProps[name] && darkProps[name] !== val) {
            token.$dark = type === 'color' ? normalizeColor(darkProps[name]) : darkProps[name];
          }
          dtcgTokens[name] = token;
        } else if (val) {
          gaps.push({ source: 'runtime', name, value: val, reason: 'runtime value type could not be inferred' });
        }
      }

      if (name.startsWith('_computed.') && val && val !== 'rgba(0, 0, 0, 0)' && val !== '') {
        const resolved = Object.entries(dtcgTokens).find(([, t]) => {
          return t.$value === val || t.$value === normalizeColor(val);
        });
        if (!resolved) {
          gaps.push({
            source: 'runtime', name, value: val,
            reason: 'computed value not resolvable to a named token — must not be silently inlined',
          });
        }
      }
    }

    console.log('Runtime pass complete. Light+dark computed styles merged.');
  } catch (e) {
    console.error(`Warning: runtime Playwright pass failed: ${e.message}`);
    console.error('Continuing with static tokens only.');
  }
}

// ── Write outputs ─────────────────────────────────────────────────────────────

function writeOutputFiles() {
  mkdirSync(outDir, { recursive: true });

  const tokensOut = {
    _meta: {
      schema: 'h5-to-swiftui/tokens@1',
      source: h5Src,
      generated_at: new Date().toISOString(),
      ...(spacingScale && { spacing_scale: spacingScale }),
      ...(Object.keys(lightDarkPairs).length > 0 && { light_dark_pairs: lightDarkPairs }),
    },
    ...dtcgTokens,
  };

  const tokensPath = join(outDir, 'tokens.json');
  const gapsPath   = join(outDir, 'token-gaps.json');

  writeFileSync(tokensPath, JSON.stringify(tokensOut, null, 2) + '\n', 'utf8');
  writeFileSync(gapsPath, JSON.stringify({ schema: 'h5-to-swiftui/token-gaps@1', gaps }, null, 2) + '\n', 'utf8');

  console.log(`\nTokens: ${tokensPath} (${Object.keys(dtcgTokens).length} tokens)`);
  console.log(`Gaps:   ${gapsPath} (${gaps.length} unresolvable values)`);
  if (gaps.length > 0) {
    console.log(`\nIMPORTANT: ${gaps.length} values in token-gaps.json MUST NOT be silently inlined during conversion.`);
  }
}

writeOutputFiles();
process.exit(0);
