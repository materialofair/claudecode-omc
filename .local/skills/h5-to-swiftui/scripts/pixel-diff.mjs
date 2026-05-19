#!/usr/bin/env node
/**
 * pixel-diff.mjs — Stage 5: visual diff cascade for h5-to-swiftui
 *
 * Usage:
 *   node pixel-diff.mjs <imgA> <imgB> [--bbox-map manifest.json] [--calibration calibration.json]
 *                       [--component <name>] [--out-mask <path.png>]
 *                       [--gen-bbox-map gen-bboxes.json]
 *
 * Diff cascade (in order):
 *   1. pHash Hamming (DCT 8×8) — raw distance + phash_fast_candidate flag
 *      (necessary-not-sufficient; this script NEVER decides "converged" — the
 *       verdict is evaluate-convergence.mjs's job, not pixel-diff's)
 *   2. Region split using bbox-map (if provided):
 *      - text regions:     scored by layout-box IoU + fg/bg token-color CIEDE2000 ΔE
 *                          (NOT glyph SSIM — cross-renderer glyphs are not comparable)
 *        IoU is REAL only when --gen-bbox-map supplies the generated bbox for
 *        the region; otherwise iou is `null` (never a fabricated 1.0).
 *      - non-text regions: SSIM (8-pixel window) + CIEDE2000 ΔE
 *   3. AA-tolerant diff mask PNG (YIQ threshold + AA skip)
 *   4. Inter-component spacing delta — `null` unless generated positions are
 *      supplied via --gen-bbox-map (never a fabricated {top:0,leading:0})
 *
 * Inputs are assumed CO-REGISTERED (same dimensions). pixel-diff.mjs does NOT
 * normalize: callers MUST pre-normalize both sides via Stage 2.5
 * `calibration.transform` (crop/resample/P3→sRGB) BEFORE calling this.
 * Mismatched dimensions are a HARD error (exit 1), never a silent partial diff.
 *
 * --gen-bbox-map <json> schema (component-relative pixel coords):
 *   { "ComponentName": [ { "label": "price", "x": .., "y": .., "w": .., "h": .. }, ... ] }
 *   or a flat array [ { "label": .., "x": .., "y": .., "w": .., "h": .. } ].
 *   A region's IoU is computed via bboxIoU(refBox, genBox) when a generated
 *   box with the same label (or same mark order) is present.
 *
 * Outputs:
 *   JSON to stdout — schema: h5-to-swiftui/diff@1
 *   Optional diff mask PNG via --out-mask
 *
 * Exit codes:
 *   0  — diff computed, JSON on stdout
 *   1  — fatal error (bad args, file not found, image-size mismatch)
 *   2  — image dependency (pngjs) not installed (actionable hint printed)
 *
 * Examples:
 *   node pixel-diff.mjs reference.png generated.png
 *   node pixel-diff.mjs reference.png generated.png --bbox-map manifest.json --out-mask diff.png
 *   node pixel-diff.mjs reference.png generated.png --calibration calibration.json --component ProductCard
 *   node pixel-diff.mjs ref.png gen.png --bbox-map manifest.json --gen-bbox-map gen-bboxes.json
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import {
  requirePng,
  loadPng,
  savePng,
  pHash,
  hammingDistance,
  ssimWindow,
  ciede2000Region,
  buildDiffMask,
  bboxIoU,
  quantile,
} from './_imglib.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`pixel-diff.mjs — h5-to-swiftui visual diff cascade

Usage:
  node pixel-diff.mjs <imgA> <imgB> [--bbox-map manifest.json]
                      [--calibration calibration.json]
                      [--component <name>] [--out-mask <path.png>]
                      [--gen-bbox-map <gen-bboxes.json>]

Arguments:
  <imgA>                  Reference image (PNG, sRGB)
  <imgB>                  Generated image (PNG, sRGB — P3 must be pre-converted)
  --bbox-map <path>       reference/manifest.json with bbox data for region split
  --calibration <path>    calibration.json from calibrate-render.mjs
  --component <name>      Component name for the output schema (default: "unknown")
  --out-mask <path>       Write AA-tolerant diff mask PNG to this path
  --gen-bbox-map <path>   Generated-component bboxes (component-relative px).
                          When present, text-region IoU is the REAL bboxIoU
                          against the matching generated box. When absent,
                          iou is null (never a fabricated 1.0).

Output (stdout):
  JSON matching schema h5-to-swiftui/diff@1

Exit codes:
  0  Success — JSON on stdout
  1  Fatal error (bad args, file not found, image-size mismatch)
  2  pngjs not installed

Co-registration:
  pixel-diff.mjs does NOT normalize. Inputs MUST already be the same
  dimensions; pre-normalize via Stage 2.5 calibration.transform first.
  Mismatched dimensions are a HARD error (exit 1), not a silent partial diff.

Diff cascade:
  pHash Hamming      → raw distance + phash_fast_candidate (necessary, NOT
                       sufficient — the verdict is evaluate-convergence.mjs's)
  text regions       → IoU (real via --gen-bbox-map, else null) + fg/bg ΔE
  non-text regions   → SSIM (8px window) + CIEDE2000 ΔE
  full image         → AA-tolerant mask + global SSIM

Examples:
  node pixel-diff.mjs ref.png gen.png
  node pixel-diff.mjs ref.png gen.png --bbox-map .h5-to-swiftui/reference/manifest.json \\
      --component ProductCard --out-mask .h5-to-swiftui/diff/ProductCard.iter1.mask.png
  node pixel-diff.mjs ref.png gen.png --bbox-map manifest.json \\
      --gen-bbox-map .h5-to-swiftui/gen/ProductCard.bboxes.json --component ProductCard
`);
  process.exit(0);
}

// Collect positional args
const positionals = args.filter(a => !a.startsWith('--'));
if (positionals.length < 2) {
  console.error('Error: <imgA> and <imgB> are required.\nRun with --help for usage.');
  process.exit(1);
}

const imgAPath = resolve(positionals[0]);
const imgBPath = resolve(positionals[1]);

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

const bboxMapPath    = getFlag('--bbox-map');
const calibPath      = getFlag('--calibration');
const componentName  = getFlag('--component', 'unknown');
const outMaskPath    = getFlag('--out-mask');
const genBboxMapPath = getFlag('--gen-bbox-map');

// ── Validate inputs ───────────────────────────────────────────────────────────

for (const [label, p] of [['imgA', imgAPath], ['imgB', imgBPath]]) {
  if (!existsSync(p)) {
    console.error(`Error: ${label} not found: ${p}`);
    process.exit(1);
  }
}

if (bboxMapPath && !existsSync(bboxMapPath)) {
  console.error(`Error: --bbox-map not found: ${bboxMapPath}`);
  process.exit(1);
}

if (calibPath && !existsSync(calibPath)) {
  console.error(`Error: --calibration not found: ${calibPath}`);
  process.exit(1);
}

if (genBboxMapPath && !existsSync(genBboxMapPath)) {
  console.error(`Error: --gen-bbox-map not found: ${genBboxMapPath}`);
  process.exit(1);
}

// ── Load PNG dependency early for clear error ─────────────────────────────────
await requirePng();

// ── Load images ───────────────────────────────────────────────────────────────

let imgA, imgB;
try {
  [imgA, imgB] = await Promise.all([loadPng(imgAPath), loadPng(imgBPath)]);
} catch (e) {
  console.error(`Error: failed to load image: ${e.message}`);
  process.exit(1);
}

// HARD error on size mismatch — a silent partial diff fabricates a metric.
// Inputs MUST be co-registered first via Stage 2.5 calibration.transform
// (crop → resample → P3→sRGB). pixel-diff.mjs deliberately does NOT normalize.
if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
  console.error(
    `Error: image sizes differ — A=${imgA.width}×${imgA.height}, B=${imgB.width}×${imgB.height}\n` +
    'pixel-diff.mjs requires CO-REGISTERED inputs (identical dimensions).\n' +
    'Pre-normalize BOTH sides through Stage 2.5 calibration.transform\n' +
    '(crop simulator chrome → resample to common logical raster → P3→sRGB)\n' +
    'BEFORE calling pixel-diff.mjs. It refuses a partial overlap diff because\n' +
    'that would emit a fabricated metric over a mis-registered region.\n' +
    (calibPath
      ? '--calibration was supplied, but pixel-diff.mjs does not itself apply\n' +
        'the transform: the caller must pre-normalize the rasters.\n'
      : '')
  );
  process.exit(1);
}

const overlapW = imgA.width;
const overlapH = imgA.height;

// ── Load optional JSON inputs ─────────────────────────────────────────────────

let bboxMap    = null;
let calibData  = null;
let genBboxMap = null;

if (bboxMapPath) {
  try {
    const { readFileSync } = await import('node:fs');
    bboxMap = JSON.parse(readFileSync(bboxMapPath, 'utf8'));
  } catch (e) {
    console.error(`Error: cannot parse --bbox-map: ${e.message}`);
    process.exit(1);
  }
}

if (genBboxMapPath) {
  try {
    const { readFileSync } = await import('node:fs');
    genBboxMap = JSON.parse(readFileSync(genBboxMapPath, 'utf8'));
  } catch (e) {
    console.error(`Error: cannot parse --gen-bbox-map: ${e.message}`);
    process.exit(1);
  }
}

if (calibPath) {
  try {
    const { readFileSync } = await import('node:fs');
    calibData = JSON.parse(readFileSync(calibPath, 'utf8'));
  } catch (e) {
    console.error(`Error: cannot parse --calibration: ${e.message}`);
    process.exit(1);
  }
}

// ── Step 1: pHash Hamming ─────────────────────────────────────────────────────

const hashA = pHash(imgA);
const hashB = pHash(imgB);
const phashHamming = hammingDistance(hashA, hashB);

// ── Step 2: Region-split diff ─────────────────────────────────────────────────

/**
 * Extract bounding boxes for a component from the manifest.
 * Returns { textBoxes: [{x,y,w,h,mark,label}], nontextBoxes: [{x,y,w,h,mark,label}] }
 * Falls back to treating the whole image as non-text if no manifest.
 */
function extractRegions(manifest, compName) {
  const textBoxes = [];
  const nontextBoxes = [];

  if (!manifest) {
    return { textBoxes, nontextBoxes: [{ x: 0, y: 0, w: overlapW, h: overlapH, mark: 0, label: 'full' }] };
  }

  // Walk screens → components; match by component name
  let markIndex = 1;
  const screens = manifest.screens ?? [];
  for (const screen of screens) {
    for (const comp of (screen.components ?? [])) {
      if (comp.name !== compName && compName !== 'unknown') continue;
      const bbox = comp.bbox_css_px;
      if (!bbox) continue;
      const region = {
        x: Math.round(bbox.x ?? 0),
        y: Math.round(bbox.y ?? 0),
        w: Math.round(bbox.width ?? bbox.w ?? 0),
        h: Math.round(bbox.height ?? bbox.h ?? 0),
        mark: markIndex++,
        label: comp.name,
      };
      // Heuristic: classify as text if the component name contains a text keyword
      const isText = /text|label|title|heading|paragraph|caption|link|badge|tag/i.test(comp.name) ||
        (comp.is_text === true);
      if (isText) textBoxes.push(region);
      else nontextBoxes.push(region);
    }
  }

  // Also check for explicit bboxes array on the manifest (bbox_map format)
  const bboxes = manifest.bboxes ?? [];
  for (const bb of bboxes) {
    const region = {
      x: Math.round(bb.x ?? 0),
      y: Math.round(bb.y ?? 0),
      w: Math.round(bb.w ?? bb.width ?? 0),
      h: Math.round(bb.h ?? bb.height ?? 0),
      mark: markIndex++,
      label: bb.label ?? bb.name ?? 'region',
      fg_color: bb.fg_color,
      bg_color: bb.bg_color,
    };
    if (bb.is_text) textBoxes.push(region);
    else nontextBoxes.push(region);
  }

  // Fallback: no matching regions found → whole image as non-text
  if (textBoxes.length === 0 && nontextBoxes.length === 0) {
    nontextBoxes.push({ x: 0, y: 0, w: overlapW, h: overlapH, mark: 0, label: 'full' });
  }

  return { textBoxes, nontextBoxes };
}

const { textBoxes, nontextBoxes } = extractRegions(bboxMap, componentName);

// Score non-text regions: SSIM + CIEDE2000
const nontextResults = [];
for (const box of nontextBoxes) {
  const roi = { x: box.x, y: box.y, w: box.w, h: box.h };
  const ssim = ssimWindow(imgA, imgB, roi, 8);
  const { p95: deltaE_p95 } = ciede2000Region(imgA, imgB, roi);
  nontextResults.push({
    mark: box.mark,
    label: box.label,
    ssim: Math.round(ssim * 1000) / 1000,
    deltaE_p95: Math.round(deltaE_p95 * 100) / 100,
  });
}

// Resolve a generated bbox for a reference text region.
// genBboxMap accepted forms:
//   { "<component>": [ {label,x,y,w,h}, ... ] }   (component-keyed)
//   [ {label,x,y,w,h}, ... ]                       (flat array)
// Match priority: same `label`, else positional (Nth text box ↔ Nth gen box).
function genBoxListFor(map, compName) {
  if (!map) return null;
  if (Array.isArray(map)) return map;
  if (compName && Array.isArray(map[compName])) return map[compName];
  // single-component map with one array value
  const vals = Object.values(map).filter(Array.isArray);
  return vals.length === 1 ? vals[0] : null;
}
const genBoxList = genBoxListFor(genBboxMap, componentName);

function findGenBox(refBox, idx) {
  if (!genBoxList) return null;
  if (refBox.label) {
    const byLabel = genBoxList.find(
      g => (g.label ?? g.name) === refBox.label
    );
    if (byLabel) return byLabel;
  }
  return genBoxList[idx] ?? null;
}

// Score text regions: IoU + token-color ΔE (fg + bg)
//   - iou: REAL layout-box IoU via bboxIoU(refBox, genBox) when --gen-bbox-map
//     supplies the matching generated box; otherwise `null` (never a
//     fabricated 1.0 — the absence of a generated bbox is reported honestly).
//   - fg_deltaE: median pixel color in the top-center strip (glyph-dominated).
//   - bg_deltaE: corner samples (background-dominated).
const textResults = [];
let textIdx = 0;
for (const box of textBoxes) {
  const refBox = { x: box.x, y: box.y, w: box.w, h: box.h, label: box.label };

  // REAL IoU only when a generated bbox is supplied for this region.
  const genBox = findGenBox(refBox, textIdx);
  let iou = null;
  let iouNote;
  if (genBox) {
    iou = Math.round(
      bboxIoU(
        { x: refBox.x, y: refBox.y, w: refBox.w, h: refBox.h },
        {
          x: genBox.x ?? 0,
          y: genBox.y ?? 0,
          w: genBox.w ?? genBox.width ?? 0,
          h: genBox.h ?? genBox.height ?? 0,
        }
      ) * 1000
    ) / 1000;
  } else {
    iouNote =
      'no generated bbox supplied (--gen-bbox-map absent or no match) — ' +
      'IoU is null, NOT assumed 1.0';
  }
  textIdx++;

  // fg: top-center strip (glyph color region)
  const fgRoi = {
    x: refBox.x + Math.floor(refBox.w * 0.25),
    y: refBox.y,
    w: Math.max(1, Math.floor(refBox.w * 0.5)),
    h: Math.max(1, Math.floor(refBox.h * 0.3)),
  };
  const { p95: fg_deltaE } = ciede2000Region(imgA, imgB, clipRoi(fgRoi, overlapW, overlapH));

  // bg: corner samples
  const bgRoi = {
    x: refBox.x,
    y: refBox.y + Math.floor(refBox.h * 0.7),
    w: Math.max(1, Math.floor(refBox.w * 0.2)),
    h: Math.max(1, Math.floor(refBox.h * 0.3)),
  };
  const { p95: bg_deltaE } = ciede2000Region(imgA, imgB, clipRoi(bgRoi, overlapW, overlapH));

  textResults.push({
    mark: box.mark,
    label: box.label,
    iou,                       // REAL bboxIoU, or null when no gen bbox
    ...(iouNote ? { iou_note: iouNote } : {}),
    fg_deltaE: Math.round(fg_deltaE * 100) / 100,
    bg_deltaE: Math.round(bg_deltaE * 100) / 100,
  });
}

function clipRoi(roi, maxW, maxH) {
  return {
    x: Math.max(0, Math.min(roi.x, maxW - 1)),
    y: Math.max(0, Math.min(roi.y, maxH - 1)),
    w: Math.max(1, Math.min(roi.w, maxW - roi.x)),
    h: Math.max(1, Math.min(roi.h, maxH - roi.y)),
  };
}

// ── Step 3: AA-tolerant diff mask ─────────────────────────────────────────────

const { mask, diffPixelCount, totalPixels } = buildDiffMask(imgA, imgB);

if (outMaskPath) {
  const maskDir = dirname(outMaskPath);
  mkdirSync(maskDir, { recursive: true });
  try {
    await savePng(outMaskPath, mask);
  } catch (e) {
    process.stderr.write(`Warning: could not write diff mask: ${e.message}\n`);
  }
}

// ── Step 4: Global SSIM ───────────────────────────────────────────────────────

const globalSsim = ssimWindow(imgA, imgB, { x: 0, y: 0, w: overlapW, h: overlapH }, 8);

// ── Step 5: Inter-component spacing delta ────────────────────────────────────

// Spacing delta is only real when generated component positions are known
// (supplied via --gen-bbox-map). Without them we emit `null` + a note — NOT
// fabricated zeros, which would be a false "no drift" signal.
let interComponentSpacingDelta = null;
let spacingNote;

if (bboxMap && bboxMap.screens) {
  const screens = bboxMap.screens ?? [];
  const allComps = screens.flatMap(s => s.components ?? []);
  if (allComps.length >= 2) {
    const sorted = allComps
      .filter(c => c.bbox_css_px)
      .sort((a, b) => (a.bbox_css_px.y ?? 0) - (b.bbox_css_px.y ?? 0));
    if (sorted.length >= 2) {
      const first = sorted[0].bbox_css_px;
      const second = sorted[1].bbox_css_px;
      const expectedGap = (second.y ?? 0) - ((first.y ?? 0) + (first.height ?? 0));

      if (genBoxList && genBoxList.length >= 2) {
        // Real delta: compare reference gap vs generated gap.
        const g = [...genBoxList]
          .filter(b => (b.y ?? 0) !== undefined)
          .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
        const genGap =
          (g[1].y ?? 0) - ((g[0].y ?? 0) + (g[0].h ?? g[0].height ?? 0));
        const topDelta = Math.round(genGap - expectedGap);
        const leadingDelta = Math.round((g[0].x ?? 0) - (first.x ?? 0));
        interComponentSpacingDelta = {
          top: topDelta,
          leading: leadingDelta,
          expected_gap_px: Math.round(expectedGap),
          measured_gap_px: Math.round(genGap),
        };
      } else {
        // No generated positions — report null, not fabricated zeros.
        spacingNote =
          'null: generated component positions unknown ' +
          '(--gen-bbox-map absent); reporting null, NOT zeros';
      }
    }
  }
}

// ── Assemble output (schema: h5-to-swiftui/diff@1) ───────────────────────────

const output = {
  schema: 'h5-to-swiftui/diff@1',
  component: componentName,
  phash_hamming: phashHamming,
  // necessary-not-sufficient: a low phash distance is a FAST CANDIDATE only.
  // It is NOT a terminal "converged" signal — the region gate must still pass.
  // The verdict is evaluate-convergence.mjs's job, not pixel-diff's.
  phash_fast_candidate: phashHamming <= 5,
  regions: {
    text: textResults.map(r => ({
      mark: r.mark,
      ...(r.label && r.label !== 'region' ? { label: r.label } : {}),
      iou: r.iou,                                    // number | null
      ...(r.iou_note ? { iou_note: r.iou_note } : {}),
      fg_deltaE: r.fg_deltaE,
      bg_deltaE: r.bg_deltaE,
    })),
    nontext: nontextResults.map(r => ({
      mark: r.mark,
      ...(r.label && r.label !== 'full' ? { label: r.label } : {}),
      ssim: r.ssim,
      deltaE_p95: r.deltaE_p95,
    })),
  },
  // null (not {top:0,leading:0}) when generated positions are unknown.
  inter_component_spacing_delta_pt: interComponentSpacingDelta,
  ...(spacingNote ? { inter_component_spacing_delta_note: spacingNote } : {}),
  diff_mask_png: outMaskPath ?? null,
  global_ssim: Math.round(globalSsim * 1000) / 1000,
  diff_pixel_fraction: Math.round((diffPixelCount / totalPixels) * 10000) / 10000,
};

// Attach calibration floor reference if provided
if (calibData?.floor) {
  output.calibration_floor_ref = calibData.floor;
}

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
