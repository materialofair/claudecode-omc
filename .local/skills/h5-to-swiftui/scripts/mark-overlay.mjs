#!/usr/bin/env node
/**
 * mark-overlay.mjs — Stage 5 Set-of-Mark: numbered overlays for visual diff feedback
 *
 * Usage:
 *   node mark-overlay.mjs --ref ref.png --gen gen.png
 *                         --bbox-map manifest.json
 *                         --out-dir <dir>
 *                         [--diff-mask mask.png]
 *
 * Draws IDENTICAL numbered Set-of-Mark overlays on both the reference and
 * generated images, using a shared bbox map.  The same index is assigned to
 * the same component on both sides — this identity is the point of the tool.
 *
 * Mark numbering:
 *   Components are sorted deterministically by (y ascending, x ascending) on
 *   the reference bbox coordinates.  Indices start at 1.
 *
 * Text rendering note:
 *   No font dependency is used.  Each mark is a small filled badge rectangle
 *   (colored tick) near the bbox top-left.  The numeric index appears in
 *   marks.json only (not rasterized as text).
 *
 * bbox map format:
 *   reference/manifest.json produced by capture-reference.mjs
 *   schema h5-to-swiftui/reference@1:
 *   { screens: [ { components: [ { name, bbox_css_px: {x,y,width,height} } ] } ] }
 *
 * Outputs:
 *   <out-dir>/ref.marked.png      Reference with numbered overlays
 *   <out-dir>/gen.marked.png      Generated with numbered overlays (same indices)
 *   <out-dir>/ref.diffmask.png    (if --diff-mask) red overlay composited on ref
 *   <out-dir>/marks.json          Legend: [ { index, name, bbox } ]
 *
 * Exit codes:
 *   0  — outputs written
 *   1  — fatal error (bad args, file not found)
 *   2  — pngjs not installed (actionable hint printed)
 *
 * Examples:
 *   node mark-overlay.mjs --ref ref.png --gen gen.png \
 *       --bbox-map reference/manifest.json --out-dir artifacts/marks
 *   node mark-overlay.mjs --ref ref.png --gen gen.png \
 *       --bbox-map reference/manifest.json --out-dir artifacts/marks \
 *       --diff-mask artifacts/diff/mask.png
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  requirePng,
  loadPng,
  savePng,
  drawRect,
  drawFilledRect,
} from './_imglib.mjs';

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`mark-overlay.mjs — Stage 5 Set-of-Mark overlay generator

Usage:
  node mark-overlay.mjs --ref ref.png --gen gen.png
                        --bbox-map manifest.json
                        --out-dir <dir>
                        [--diff-mask mask.png]

Arguments:
  --ref <path>         H5/Playwright reference PNG (required)
  --gen <path>         SwiftUI generated PNG (required)
  --bbox-map <path>    reference/manifest.json (schema h5-to-swiftui/reference@1) (required)
  --out-dir <dir>      Output directory (required)
  --diff-mask <path>   Optional PNG diff mask to composite as red overlay on ref

Mark numbering:
  Components are sorted by (y asc, x asc) on reference bbox coords.
  Indices start at 1. SAME index = SAME component on both sides.

Text rendering:
  No font dependency. Each mark is a colored filled badge rectangle (tick)
  near the bbox top-left. Numeric index is written to marks.json only.

Overlay style:
  Bbox outline: magenta (255,0,255) 1px border
  Mark badge:   white-on-magenta filled rect in top-left corner
  Badge size:   12×12 px at the bbox origin

Outputs:
  <out-dir>/ref.marked.png      Reference with numbered overlays
  <out-dir>/gen.marked.png      Generated with identical numbered overlays
  <out-dir>/ref.diffmask.png    (if --diff-mask) red overlay composited on ref
  <out-dir>/marks.json          Legend: [{index, name, bbox}]

Exit codes:
  0  Success
  1  Fatal error
  2  pngjs not installed

Examples:
  node mark-overlay.mjs --ref ref.png --gen gen.png \\
      --bbox-map reference/manifest.json --out-dir artifacts/marks
  node mark-overlay.mjs --ref ref.png --gen gen.png \\
      --bbox-map reference/manifest.json --out-dir artifacts/marks \\
      --diff-mask artifacts/diff/ProductCard.iter2.mask.png
`);
  process.exit(0);
}

function getFlag(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const val = args[idx + 1];
  if (val === undefined || val.startsWith('--')) {
    console.error(`Error: ${flag} requires an argument.`);
    process.exit(1);
  }
  return val;
}

const refFlagRaw     = getFlag('--ref');
const genFlagRaw     = getFlag('--gen');
const bboxMapFlagRaw = getFlag('--bbox-map');
const outDirFlagRaw  = getFlag('--out-dir');
const diffMaskRaw    = getFlag('--diff-mask');

// Validate required flags
const missing = [];
if (!refFlagRaw)     missing.push('--ref');
if (!genFlagRaw)     missing.push('--gen');
if (!bboxMapFlagRaw) missing.push('--bbox-map');
if (!outDirFlagRaw)  missing.push('--out-dir');

if (missing.length > 0) {
  console.error(`Error: the following required flags are missing: ${missing.join(', ')}\nRun with --help for usage.`);
  process.exit(1);
}

const refPath     = resolve(refFlagRaw);
const genPath     = resolve(genFlagRaw);
const bboxMapPath = resolve(bboxMapFlagRaw);
const outDir      = resolve(outDirFlagRaw);
const diffMaskPath = diffMaskRaw ? resolve(diffMaskRaw) : null;

// Validate file existence
for (const [label, p] of [['--ref', refPath], ['--gen', genPath], ['--bbox-map', bboxMapPath]]) {
  if (!existsSync(p)) {
    console.error(`Error: ${label} file not found: ${p}`);
    process.exit(1);
  }
}

if (diffMaskPath && !existsSync(diffMaskPath)) {
  console.error(`Error: --diff-mask file not found: ${diffMaskPath}`);
  process.exit(1);
}

// ── Load PNG dependency early for clear error ────────────────────────────────

await requirePng();

// ── Load images ───────────────────────────────────────────────────────────────

let imgRef, imgGen, imgDiffMask;

try {
  const loads = [loadPng(refPath), loadPng(genPath)];
  if (diffMaskPath) loads.push(loadPng(diffMaskPath));
  const results = await Promise.all(loads);
  imgRef = results[0];
  imgGen = results[1];
  if (diffMaskPath) imgDiffMask = results[2];
} catch (e) {
  console.error(`Error: failed to load image: ${e.message}`);
  process.exit(1);
}

// ── Load bbox map ─────────────────────────────────────────────────────────────

let manifest;
try {
  manifest = JSON.parse(readFileSync(bboxMapPath, 'utf8'));
} catch (e) {
  console.error(`Error: cannot parse --bbox-map: ${e.message}`);
  process.exit(1);
}

// ── Extract and sort components ───────────────────────────────────────────────

// Collect all components from all screens
const rawComponents = [];
const screens = manifest.screens ?? [];
for (const screen of screens) {
  for (const comp of (screen.components ?? [])) {
    const bbox = comp.bbox_css_px;
    if (!bbox) continue;
    rawComponents.push({
      name: comp.name,
      x: Math.round(bbox.x ?? 0),
      y: Math.round(bbox.y ?? 0),
      w: Math.round(bbox.width ?? bbox.w ?? 0),
      h: Math.round(bbox.height ?? bbox.h ?? 0),
    });
  }
}

if (rawComponents.length === 0) {
  console.error(
    'Error: no components with bbox_css_px found in --bbox-map.\n' +
    'Ensure the manifest was produced by capture-reference.mjs.'
  );
  process.exit(1);
}

// Deterministic stable sort: primary y ascending, secondary x ascending,
// tertiary name alphabetical (ensures identical ordering on both sides).
rawComponents.sort((a, b) => {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.name.localeCompare(b.name);
});

// Assign 1-based indices
const components = rawComponents.map((c, i) => ({ ...c, index: i + 1 }));

console.error(`Loaded ${components.length} component(s) from bbox map.`);

// ── Drawing helpers ───────────────────────────────────────────────────────────

// Badge: small filled rectangle near bbox top-left that encodes the index.
// Since we have no font rendering, we use a colored square with a tick count:
//   index 1 = 1 white cell, index 2 = 2 white cells, etc. up to BADGE_CELLS.
// For indices > BADGE_CELLS the badge is fully filled (saturation marker).
// The marks.json legend maps index → component name for all interpretation.
//
// Style:
//   Bbox border:  magenta (255, 0, 255), 1px
//   Badge fill:   magenta background, white small tick square(s)
//   Badge size:   BADGE_W × BADGE_H px at (bbox.x, bbox.y)

const BADGE_W = 14;
const BADGE_H = 14;
const TICK_SIZE = 3;   // px per white tick cell
const TICK_PAD = 1;    // px padding between ticks
const BORDER_R = 255, BORDER_G = 0, BORDER_B = 255;  // magenta
const BADGE_BG_R = 180, BADGE_BG_G = 0, BADGE_BG_B = 180;  // dark magenta
const TICK_R = 255, TICK_G = 255, TICK_B = 255;  // white

function drawMark(img, comp) {
  const { x, y, w, h, index } = comp;

  // 1. Draw bounding box outline (magenta, 1px)
  if (w > 0 && h > 0) {
    drawRect(img, x, y, w, h, BORDER_R, BORDER_G, BORDER_B, 220);
  }

  // 2. Draw filled badge rectangle at top-left corner of bbox
  const bx = Math.max(0, x);
  const by = Math.max(0, y);
  drawFilledRect(img, bx, by, BADGE_W, BADGE_H, BADGE_BG_R, BADGE_BG_G, BADGE_BG_B, 240);

  // 3. Draw white tick cells to encode the index (up to 4 cells in a 2×2 grid)
  // Layout inside badge: max 4 ticks in a 2×2 grid
  const MAX_TICKS = 4;
  const tickCount = Math.min(index, MAX_TICKS);
  // cells are placed in row-major order: (0,0), (1,0), (0,1), (1,1)
  const positions = [
    [bx + TICK_PAD,                      by + TICK_PAD],
    [bx + TICK_PAD + TICK_SIZE + TICK_PAD, by + TICK_PAD],
    [bx + TICK_PAD,                      by + TICK_PAD + TICK_SIZE + TICK_PAD],
    [bx + TICK_PAD + TICK_SIZE + TICK_PAD, by + TICK_PAD + TICK_SIZE + TICK_PAD],
  ];
  for (let t = 0; t < tickCount; t++) {
    const [tx, ty] = positions[t];
    drawFilledRect(img, tx, ty, TICK_SIZE, TICK_SIZE, TICK_R, TICK_G, TICK_B, 255);
  }

  // If index > MAX_TICKS, fill the entire badge white to indicate "5+" saturation
  if (index > MAX_TICKS) {
    drawFilledRect(img, bx + 1, by + 1, BADGE_W - 2, BADGE_H - 2, TICK_R, TICK_G, TICK_B, 200);
  }
}

// ── Clone images and draw marks ───────────────────────────────────────────────

// Deep-copy image buffers so originals are unmodified
function cloneImg(img) {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

const imgRefMarked = cloneImg(imgRef);
const imgGenMarked = cloneImg(imgGen);

for (const comp of components) {
  drawMark(imgRefMarked, comp);
  drawMark(imgGenMarked, comp);
}

// ── Build diff-mask composite (optional) ─────────────────────────────────────

let imgRefDiffMask = null;

if (imgDiffMask) {
  // Alpha-composite the diff mask (red channel pixels) onto a copy of ref.
  // diff mask pixels: red (255,0,0,255) = diff; yellow (255,255,0,200) = AA; rest = transparent
  imgRefDiffMask = cloneImg(imgRef);
  const mW = Math.min(imgDiffMask.width, imgRef.width);
  const mH = Math.min(imgDiffMask.height, imgRef.height);

  for (let py = 0; py < mH; py++) {
    for (let px = 0; px < mW; px++) {
      const mi = (py * imgDiffMask.width + px) * 4;
      const ri = (py * imgRefDiffMask.width + px) * 4;
      const mAlpha = imgDiffMask.data[mi + 3];
      if (mAlpha === 0) continue;

      const a01 = mAlpha / 255;
      const ia  = 1 - a01;
      imgRefDiffMask.data[ri]     = Math.round(imgDiffMask.data[mi]     * a01 + imgRefDiffMask.data[ri]     * ia);
      imgRefDiffMask.data[ri + 1] = Math.round(imgDiffMask.data[mi + 1] * a01 + imgRefDiffMask.data[ri + 1] * ia);
      imgRefDiffMask.data[ri + 2] = Math.round(imgDiffMask.data[mi + 2] * a01 + imgRefDiffMask.data[ri + 2] * ia);
      imgRefDiffMask.data[ri + 3] = Math.min(255, imgRefDiffMask.data[ri + 3] + mAlpha);
    }
  }
}

// ── Write outputs ─────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const refMarkedPath    = join(outDir, 'ref.marked.png');
const genMarkedPath    = join(outDir, 'gen.marked.png');
const diffMaskOutPath  = join(outDir, 'ref.diffmask.png');
const marksJsonPath    = join(outDir, 'marks.json');

try {
  await savePng(refMarkedPath, imgRefMarked);
  console.error(`Written: ${refMarkedPath}`);
} catch (e) {
  console.error(`Error: could not write ref.marked.png: ${e.message}`);
  process.exit(1);
}

try {
  await savePng(genMarkedPath, imgGenMarked);
  console.error(`Written: ${genMarkedPath}`);
} catch (e) {
  console.error(`Error: could not write gen.marked.png: ${e.message}`);
  process.exit(1);
}

if (imgRefDiffMask) {
  try {
    await savePng(diffMaskOutPath, imgRefDiffMask);
    console.error(`Written: ${diffMaskOutPath}`);
  } catch (e) {
    console.error(`Warning: could not write ref.diffmask.png: ${e.message}`);
  }
}

// marks.json legend: index → component name + bbox
const marksLegend = components.map(c => ({
  index: c.index,
  name:  c.name,
  bbox:  { x: c.x, y: c.y, w: c.w, h: c.h },
}));

writeFileSync(
  marksJsonPath,
  JSON.stringify({ schema: 'h5-to-swiftui/marks@1', marks: marksLegend }, null, 2) + '\n',
  'utf8'
);
console.error(`Written: ${marksJsonPath}`);

console.error(`\nOverlay complete. ${components.length} mark(s) drawn on both ref and gen.`);
process.exit(0);
