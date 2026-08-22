#!/usr/bin/env node
/**
 * calibrate-render.mjs — Stage 2.5: Render-equivalence calibration
 *
 * Usage:
 *   node calibrate-render.mjs <calibration-dir> --device "iPhone 15 Pro"
 *                             [--out calibration.json]
 *                             [--ref <h5.png>] [--gen <swift.png>]
 *                             [--sim-runtime <runtime>]
 *                             [--browser <browser-id>]
 *                             [--model-id <model>]
 *
 * Input resolution (in order of precedence):
 *   1. Explicit --ref and --gen flags.
 *   2. Auto-find in <calibration-dir>: first file matching *ref*.png as the H5
 *      reference, first file matching *gen*.png as the SwiftUI render.
 *   If neither path resolves, exits 1 with a clear error.
 *
 * Normalization pipeline (render-equivalence-calibration.md):
 *   1. Crop simulator content rect: status-bar and home-indicator insets from
 *      the pinned device DEVICES table (below).
 *   2. Resample BOTH sides to common logical raster (logical_pt × render_scale)
 *      using resampleLanczos3 — identical filter, both sides.
 *   3. p3ToSrgb on the simulator (gen) side.
 *
 * Measurements:
 *   floor.ssim_global      — whole-image SSIM after normalization
 *   floor.ssim_nontext     — SSIM over non-text ROI (whole image if no bbox map)
 *   floor.deltaE_p95       — 95th-pct CIEDE2000 ΔE
 *   floor.text_iou         — null (no bbox map provided at calibration time)
 *
 * Sanity bound (no-fake spine):
 *   If ssim_nontext < 0.95 (or text_iou < 0.9 when non-null), the toolchain
 *   is unmeasurable. Writes blocked.json next to --out and exits 1.
 *   Never emits calibration.json against an unproven metric.
 *
 *   ADDITIONAL flat-image guard: SSIM is insensitive to a uniform mean shift
 *   on near-zero-variance (effectively flat) images — a clearly-divergent
 *   solid pair can still score ~0.95. If BOTH normalized images are
 *   effectively flat (luma variance below FLAT_VARIANCE_MAX on each side),
 *   the SSIM floor is unreliable ⇒ toolchain is treated as NOT MEASURABLE
 *   (blocked.json + exit 1), never a falsely-high floor. Bundled calibration
 *   content MUST be textured (text + multi-color region), see
 *   assets/calibration/README.md.
 *
 * Structured gate (consumed by evaluate-convergence.mjs WITHOUT a string
 *   parser): `gate.converged` / `gate.close` are numeric threshold objects
 *   computed from the measured floor (nontext floor-0.005, deltaE floor+0.4,
 *   text_iou floor-0.03; close = 2x band). A human-readable `gate_explain`
 *   string is kept for humans only — it is NEVER evaluated by code.
 *
 * Calibration honesty + provenance binding:
 *   calibration.twin_hashes      = SHA-256 of the input ref + gen PNGs
 *     (non-security provenance metadata only — see twin_hashes note below).
 *   calibration.calibration_source = the bundled twin dirs this calibration
 *     was run against (relative to the skill root) + a deterministic
 *     SHA-256 source-tree hash of EACH bundled tree's SOURCE FILES
 *     (excluding build output/dotfiles). evaluate-convergence.mjs recomputes
 *     these source-tree hashes from the actual bundled assets and FAILS
 *     CLOSED on a mismatch — this binds the IDENTITY of the bundled twin
 *     source files. It does NOT bind the measured `floor` *value*: the
 *     grader separately asserts the `floor` satisfies this script's OWN
 *     sanity envelope (it writes blocked.json — not calibration.json — below
 *     ssim_nontext 0.95 / non-null text_iou 0.9), but a floor *within* that
 *     envelope yet looser than the true measured one is a disclosed
 *     irreducible residual (the grader cannot re-render to re-measure it).
 *
 * Outputs:
 *   calibration.json  — schema h5-to-swiftui/calibration@1
 *   blocked.json      — written instead when sanity bound fails (schema h5-to-swiftui/blocked@1)
 *
 * Exit codes:
 *   0  — calibration.json written
 *   1  — fatal error (bad args, file missing, sanity bound failed)
 *   2  — pngjs not installed (actionable hint printed)
 *
 * Examples:
 *   node calibrate-render.mjs assets/calibration --device "iPhone 15 Pro"
 *   node calibrate-render.mjs assets/calibration --device "iPhone 15 Pro" --out dist/calibration.json
 *   node calibrate-render.mjs assets/calibration --device "iPhone 15 Pro" \
 *       --ref assets/calibration/h5-twin.png --gen assets/calibration/swiftui-twin.png
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceTreeHash, sha256File } from './_provenance.mjs';
// Single source of truth for the sanity-envelope constants. The grader
// (evaluate-convergence.mjs) imports the SAME module, so the floor it
// asserts is identical to the floor this script refuses to emit below.
import { SSIM_NONTEXT_MIN, TEXT_IOU_MIN } from './_calib-consts.mjs';

import {
  requirePng,
  loadPng,
  ssimWindow,
  ciede2000Region,
  resampleLanczos3,
  p3ToSrgb,
  cropRect,
  quantile,
} from './_imglib.mjs';

// ── Device table (must match capture-reference.mjs DEVICES) ──────────────────
//
// Fields:
//   logical_w, logical_h  — logical point dimensions (pt)
//   status_bar_pt         — top inset (status bar + notch/island) in pt
//   home_indicator_pt     — bottom inset (home indicator) in pt
//   render_scale          — physical pixels per logical pt (@Nx)
//
// content_rect_pt = [0, status_bar_pt, logical_w, logical_h - status_bar_pt - home_indicator_pt]
// safe_area_offset_pt = [0, status_bar_pt]

const DEVICES = {
  'iPhone 15 Pro': {
    logical_w: 393, logical_h: 852,
    status_bar_pt: 59, home_indicator_pt: 34,
    render_scale: 3,
  },
  'iPhone 14 Pro': {
    logical_w: 393, logical_h: 852,
    status_bar_pt: 59, home_indicator_pt: 34,
    render_scale: 3,
  },
  'iPhone 15': {
    logical_w: 390, logical_h: 844,
    status_bar_pt: 47, home_indicator_pt: 34,
    render_scale: 3,
  },
  'iPhone SE': {
    logical_w: 375, logical_h: 667,
    status_bar_pt: 20, home_indicator_pt: 0,
    render_scale: 2,
  },
};

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`calibrate-render.mjs — Stage 2.5 render-equivalence calibration

Usage:
  node calibrate-render.mjs <calibration-dir> --device "iPhone 15 Pro"
                            [--out calibration.json]
                            [--ref <h5.png>] [--gen <swift.png>]
                            [--sim-runtime <runtime>]
                            [--browser <browser-id>]
                            [--model-id <model>]

Arguments:
  <calibration-dir>        Directory holding the known-correct H5/SwiftUI pair
  --device <name>          Target device (required); must match a known profile
  --out <path>             Output path for calibration.json (default: calibration.json
                           inside <calibration-dir>)
  --ref <path>             Explicit path to H5/Playwright reference PNG
  --gen <path>             Explicit path to SwiftUI simulator render PNG
  --sim-runtime <runtime>  Simulator runtime string to pin in output (e.g. "iOS 17.5")
  --browser <id>           Browser build string to pin (e.g. "chromium-1180")
  --model-id <id>          Model identifier to pin (e.g. "glm-5.2")

Input resolution (precedence):
  1. --ref / --gen flags if provided
  2. Auto-find in <calibration-dir>: first *ref*.png = H5 side,
     first *gen*.png = SwiftUI side (alphabetical within each glob)

Supported devices:
  "iPhone 15 Pro"   393×852 pt  status_bar=59pt  home=34pt  @3x
  "iPhone 14 Pro"   393×852 pt  status_bar=59pt  home=34pt  @3x
  "iPhone 15"       390×844 pt  status_bar=47pt  home=34pt  @3x
  "iPhone SE"       375×667 pt  status_bar=20pt  home=0pt   @2x

Normalization pipeline:
  1. Crop simulator content rect via device safe-area insets
  2. Resample BOTH sides to logical_pt × render_scale with Lanczos3
  3. P3→sRGB (relative colorimetric) on the simulator side

Sanity bound:
  If ssim_nontext < 0.95 (or text_iou < 0.9 when non-null), the toolchain is
  unmeasurable. Writes blocked.json and exits 1. Never grades against an
  unproven metric.
  Flat-image guard: if BOTH normalized images are effectively flat (near-zero
  luma variance), SSIM is unreliable for a mean shift ⇒ also blocked.json.

Structured gate (no string DSL):
  gate.converged / gate.close are numeric threshold objects, evaluated by
  evaluate-convergence.mjs WITHOUT a parser:
    converged: { ssim_nontext_min, deltaE_p95_max, text_iou_min,
                 require_judge_yes: true }
    close:     { ...2x band... , require_judge_equiv: true }
  gate_explain is a human-only string; code never evaluates it.

Calibration honesty + provenance binding:
  twin_hashes        = SHA-256 of the input ref + gen PNGs (non-security
                       provenance metadata; the security binding is
                       calibration_source).
  calibration_source = bundled twin dirs (relative to skill root) +
                       deterministic SHA-256 source-tree hash of each tree's
                       SOURCE FILES (excluding build output/dotfiles).
                       evaluate-convergence.mjs recomputes these from the
                       shipped assets and FAILS CLOSED on a mismatch — this
                       binds the twin source IDENTITY, NOT the measured floor
                       value. The grader additionally asserts the floor is
                       within this script's own sanity envelope; a floor
                       within that envelope but looser than the true measured
                       one is a disclosed irreducible residual (grader cannot
                       re-render to re-measure it).

Outputs:
  calibration.json    schema: h5-to-swiftui/calibration@1
  blocked.json        written instead when sanity bound fails

Exit codes:
  0  calibration.json written
  1  fatal error / sanity bound failed
  2  pngjs not installed

Examples:
  node calibrate-render.mjs assets/calibration --device "iPhone 15 Pro"
  node calibrate-render.mjs assets/calibration --device "iPhone 15 Pro" \\
      --out dist/calibration.json --sim-runtime "iOS 17.5 (21F79)"
`);
  process.exit(0);
}

// Positional: first non-flag arg
let calibDir = null;
for (const a of args) {
  if (!a.startsWith('--')) { calibDir = a; break; }
}

if (!calibDir) {
  console.error('Error: <calibration-dir> is required.\nRun with --help for usage.');
  process.exit(1);
}

calibDir = resolve(calibDir);

if (!existsSync(calibDir)) {
  console.error(`Error: calibration-dir not found: ${calibDir}`);
  process.exit(1);
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

const deviceName   = getFlag('--device');
const outFlagRaw   = getFlag('--out');
const refFlagRaw   = getFlag('--ref');
const genFlagRaw   = getFlag('--gen');
const simRuntime   = getFlag('--sim-runtime', 'unknown');
const browserStr   = getFlag('--browser', 'unknown');
const modelId      = getFlag('--model-id', 'unknown');

if (!deviceName) {
  console.error('Error: --device is required.\nRun with --help for usage.');
  process.exit(1);
}

const device = DEVICES[deviceName];
if (!device) {
  const known = Object.keys(DEVICES).map(d => `"${d}"`).join(', ');
  console.error(`Error: unknown device "${deviceName}".\nSupported: ${known}`);
  process.exit(1);
}

// Resolve output path
const defaultOut = join(calibDir, 'calibration.json');
const outPath = outFlagRaw ? resolve(outFlagRaw) : defaultOut;
const blockedPath = join(dirname(outPath), 'blocked.json');

// ── Resolve input PNGs ────────────────────────────────────────────────────────

function findPngGlob(dir, pattern) {
  // pattern is a substring to match (e.g. 'ref', 'gen')
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.png') && f.toLowerCase().includes(pattern))
      .sort();
    return files.length > 0 ? join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

let refPath = refFlagRaw ? resolve(refFlagRaw) : findPngGlob(calibDir, 'ref');
let genPath = genFlagRaw ? resolve(genFlagRaw) : findPngGlob(calibDir, 'gen');

if (!refPath) {
  console.error(
    'Error: could not find H5 reference PNG.\n' +
    'Either pass --ref <path> or place a file matching *ref*.png in <calibration-dir>.'
  );
  process.exit(1);
}

if (!genPath) {
  console.error(
    'Error: could not find SwiftUI render PNG.\n' +
    'Either pass --gen <path> or place a file matching *gen*.png in <calibration-dir>.'
  );
  process.exit(1);
}

if (!existsSync(refPath)) {
  console.error(`Error: --ref file not found: ${refPath}`);
  process.exit(1);
}

if (!existsSync(genPath)) {
  console.error(`Error: --gen file not found: ${genPath}`);
  process.exit(1);
}

console.error(`Device:     ${deviceName}`);
console.error(`H5 ref:     ${refPath}`);
console.error(`SwiftUI gen:${genPath}`);
console.error(`Output:     ${outPath}`);

// ── Load PNG dependency early for clear error ────────────────────────────────

await requirePng();

// ── Load images ───────────────────────────────────────────────────────────────

let imgRef, imgGen;
try {
  [imgRef, imgGen] = await Promise.all([loadPng(refPath), loadPng(genPath)]);
} catch (e) {
  console.error(`Error: failed to load image: ${e.message}`);
  process.exit(1);
}

console.error(`H5 ref size:    ${imgRef.width}×${imgRef.height}`);
console.error(`SwiftUI size:   ${imgGen.width}×${imgGen.height}`);

// ── Normalization pipeline ────────────────────────────────────────────────────

// Derive content rect from device safe-area insets
const contentX  = 0;
const contentY  = device.status_bar_pt;  // pt
const contentW  = device.logical_w;       // pt
const contentH  = device.logical_h - device.status_bar_pt - device.home_indicator_pt; // pt

// Physical pixel dimensions for the crop on the simulator side
const cropX_px  = Math.round(contentX * device.render_scale);
const cropY_px  = Math.round(contentY * device.render_scale);
const cropW_px  = Math.round(contentW * device.render_scale);
const cropH_px  = Math.round(contentH * device.render_scale);

// Common logical raster target (logical pt × render_scale = physical px of content)
const targetW = cropW_px;
const targetH = cropH_px;

console.error(`Content rect (pt):  [${contentX}, ${contentY}, ${contentW}, ${contentH}]`);
console.error(`Crop (px):          [${cropX_px}, ${cropY_px}, ${cropW_px}, ${cropH_px}]`);
console.error(`Resample target:    ${targetW}×${targetH}`);

// Step 1: Crop simulator side to content rect
// Only crop if the simulator image is taller than the content crop (has chrome)
let imgGenNorm = imgGen;
if (imgGen.height >= cropY_px + cropH_px && imgGen.width >= cropX_px + cropW_px) {
  imgGenNorm = cropRect(imgGen, cropX_px, cropY_px, cropW_px, cropH_px);
  console.error(`Cropped simulator side: ${imgGenNorm.width}×${imgGenNorm.height}`);
} else {
  console.error(
    `Warning: simulator image (${imgGen.width}×${imgGen.height}) is smaller than the ` +
    `expected crop [${cropX_px},${cropY_px},${cropW_px},${cropH_px}] — skipping crop.`
  );
}

// Step 2: Resample both sides to common logical raster (Lanczos3, identical filter)
const imgRefNorm = resampleLanczos3(imgRef, targetW, targetH);
imgGenNorm = resampleLanczos3(imgGenNorm, targetW, targetH);
console.error(`After resample — ref: ${imgRefNorm.width}×${imgRefNorm.height}, gen: ${imgGenNorm.width}×${imgGenNorm.height}`);

// Step 3: P3→sRGB on simulator (gen) side
p3ToSrgb(imgGenNorm);
console.error('P3→sRGB conversion applied to simulator side.');

// ── Measurements ─────────────────────────────────────────────────────────────

// ssim_global: whole-image SSIM
const ssim_global = ssimWindow(imgRefNorm, imgGenNorm, undefined, 8);

// ssim_nontext: without a bbox map we treat the whole image as non-text.
// The text_iou is null; we document this in the output.
const ssim_nontext = ssimWindow(imgRefNorm, imgGenNorm, undefined, 8);

// deltaE_p95: 95th-percentile CIEDE2000 ΔE over the whole image
const { p95: deltaE_p95 } = ciede2000Region(imgRefNorm, imgGenNorm);

// text_iou: null — no bbox map at calibration time
const text_iou = null;

// Luma variance per side (BT.601). A near-zero variance means the image is
// effectively flat — SSIM cannot distinguish a uniform mean shift there, so
// the floor it yields would be unreliable.
function lumaVariance(img) {
  const d = img.data;
  const n = img.width * img.height;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    varSum += (l - mean) * (l - mean);
  }
  return varSum / n;
}

// Variance threshold below which a side is "effectively flat" (luma units²).
// ~9 ≈ a 3-luma-level stddev: anything below this has essentially no structure.
const FLAT_VARIANCE_MAX = 9;
const varRef = lumaVariance(imgRefNorm);
const varGen = lumaVariance(imgGenNorm);
const bothFlat = varRef < FLAT_VARIANCE_MAX && varGen < FLAT_VARIANCE_MAX;

console.error(`\nMeasured floor:`);
console.error(`  ssim_global   = ${ssim_global.toFixed(4)}`);
console.error(`  ssim_nontext  = ${ssim_nontext.toFixed(4)}  (whole image, no bbox map)`);
console.error(`  deltaE_p95    = ${deltaE_p95.toFixed(4)}`);
console.error(`  text_iou      = null  (no bbox map provided)`);
console.error(`  luma_variance = ref ${varRef.toFixed(2)}, gen ${varGen.toFixed(2)} ` +
  `(flat threshold ${FLAT_VARIANCE_MAX})`);

// ── Sanity bound ──────────────────────────────────────────────────────────────
//
// If the known-correct pair cannot beat conservative bounds, the toolchain is
// not measurable.  Write blocked.json and exit 1.  Never fake convergence.

// SSIM_NONTEXT_MIN (0.95) and TEXT_IOU_MIN (0.9) are imported from
// ./_calib-consts.mjs — the SINGLE source of truth shared with
// evaluate-convergence.mjs. The numeric values are unchanged (byte-identical
// behavior): this script still writes blocked.json below these bounds.
const ssimFails = ssim_nontext < SSIM_NONTEXT_MIN;
// text_iou check is skipped when null (no bbox map)
const textIouFails = text_iou !== null && text_iou < TEXT_IOU_MIN;
// Flat-image guard: SSIM is insensitive to a uniform mean shift on
// near-zero-variance images, so a falsely-high floor is possible. If BOTH
// sides are flat, the floor is unreliable ⇒ not measurable.
const flatFails = bothFlat;

if (ssimFails || textIouFails || flatFails) {
  const reasons = [];
  if (ssimFails)    reasons.push(`ssim_nontext=${ssim_nontext.toFixed(4)} < ${SSIM_NONTEXT_MIN}`);
  if (textIouFails) reasons.push(`text_iou=${text_iou.toFixed(4)} < ${TEXT_IOU_MIN}`);
  if (flatFails)    reasons.push(
    `both images effectively flat (luma variance ref=${varRef.toFixed(2)}, ` +
    `gen=${varGen.toFixed(2)} < ${FLAT_VARIANCE_MAX}) — SSIM floor unreliable; ` +
    `calibration content must be textured`);

  const blocked = {
    schema: 'h5-to-swiftui/blocked@1',
    stage: '2.5',
    reason: flatFails && !ssimFails && !textIouFails
      ? 'toolchain not measurable (flat calibration content)'
      : 'toolchain not measurable',
    detail: reasons.join('; '),
    measured: {
      ssim_global:   Math.round(ssim_global  * 10000) / 10000,
      ssim_nontext:  Math.round(ssim_nontext * 10000) / 10000,
      deltaE_p95:    Math.round(deltaE_p95   * 10000) / 10000,
      text_iou,
      luma_variance: {
        ref: Math.round(varRef * 100) / 100,
        gen: Math.round(varGen * 100) / 100,
        flat_threshold: FLAT_VARIANCE_MAX,
      },
    },
    device: deviceName,
    measured_at: new Date().toISOString(),
  };

  mkdirSync(dirname(blockedPath), { recursive: true });
  writeFileSync(blockedPath, JSON.stringify(blocked, null, 2) + '\n', 'utf8');

  console.error(`\nSANITY BOUND FAILED: ${reasons.join('; ')}`);
  console.error(`Toolchain is not measurable. Wrote: ${blockedPath}`);
  console.error('calibration.json was NOT written. Fix the toolchain and re-run.');
  process.exit(1);
}

// ── Twin hashes (calibration honesty) ─────────────────────────────────────────
// SHA-256 of the raw input PNGs so a downstream reader can detect a
// degraded/swapped twin before trusting the floor.
const twinHashes = {
  ref_png: refPath,
  ref_sha256: sha256File(refPath),
  gen_png: genPath,
  gen_sha256: sha256File(genPath),
};

// ── Calibration source provenance (binds the bundled twin SOURCE IDENTITY) ────
// Skill root = parent of this script's directory (scripts/ -> skill root).
// Resolved from the script's own location so it is correct from ANY cwd.
const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL_H5_TWIN       = 'assets/calibration/h5-twin';
const REL_SWIFTUI_TWIN  = 'assets/calibration/swiftui-twin';
const calibrationSource = {
  // POSIX-relative bundled twin dirs this calibration must derive from.
  h5_twin_dir:      REL_H5_TWIN,
  swiftui_twin_dir: REL_SWIFTUI_TWIN,
  // Deterministic SHA-256 content hash of each shipped source tree's SOURCE
  // FILES (excluding build output/dotfiles). The consumer recomputes these
  // from the actual bundled assets and fails closed on a mismatch — this
  // binds the IDENTITY of the bundled twin source files. It does NOT bind
  // the measured `floor` *value*: keeping these (public, unmodified) hashes
  // while writing a loose floor is caught only down to this script's own
  // sanity envelope (the grader's FIX A check); a floor within that envelope
  // yet looser than the true measured one is a disclosed irreducible
  // residual (the grader cannot re-render to re-measure it).
  h5_twin_source_sha256:      sourceTreeHash(join(SKILL_ROOT, REL_H5_TWIN)),
  swiftui_twin_source_sha256: sourceTreeHash(join(SKILL_ROOT, REL_SWIFTUI_TWIN)),
  source_tree_hash_algo: 'sha256/sorted-relpath+filebytes/v1',
};

// ── Emit calibration.json ─────────────────────────────────────────────────────

// Structured numeric gate — evaluate-convergence.mjs reads these WITHOUT a
// string parser. Tolerances applied to the measured floor:
//   ssim_nontext_min = floor - 0.005       (looser by 0.005)
//   deltaE_p95_max   = floor + 0.4         (looser by 0.4)
//   text_iou_min     = floor - 0.03        (looser by 0.03; null ⇒ skipped)
// `close` is a 2× band of each delta from the floor.
const round4 = (v) => Math.round(v * 10000) / 10000;

const floorSsimNontext = round4(ssim_nontext);
const floorDeltaE      = round4(deltaE_p95);
const floorTextIou     = text_iou; // null when no bbox map

const D_SSIM   = 0.005;
const D_DELTAE = 0.4;
const D_IOU    = 0.03;

const gateConverged = {
  ssim_nontext_min: round4(floorSsimNontext - D_SSIM),
  deltaE_p95_max:   round4(floorDeltaE + D_DELTAE),
  text_iou_min:     floorTextIou === null ? null : round4(floorTextIou - D_IOU),
  require_judge_yes: true,
};
const gateClose = {
  ssim_nontext_min: round4(floorSsimNontext - 2 * D_SSIM),
  deltaE_p95_max:   round4(floorDeltaE + 2 * D_DELTAE),
  text_iou_min:     floorTextIou === null ? null : round4(floorTextIou - 2 * D_IOU),
  require_judge_equiv: true,
};
const gateExplain =
  `converged := ssim_nontext >= ${gateConverged.ssim_nontext_min} ` +
  `AND deltaE_p95 <= ${gateConverged.deltaE_p95_max} ` +
  (gateConverged.text_iou_min === null
    ? 'AND (text_iou gate skipped: no bbox map at calibration) '
    : `AND text_iou >= ${gateConverged.text_iou_min} `) +
  `AND judge=YES. close := same metrics at the 2x band ` +
  `(ssim>=${gateClose.ssim_nontext_min}, deltaE<=${gateClose.deltaE_p95_max}` +
  (gateClose.text_iou_min === null ? '' : `, text_iou>=${gateClose.text_iou_min}`) +
  `) AND judge=visually-equivalent-residual-subperceptual. ` +
  `Human-readable only — code reads gate.converged / gate.close numerically.`;

const calibration = {
  schema: 'h5-to-swiftui/calibration@1',
  pinned: {
    sim_runtime: simRuntime,
    device:      deviceName,
    logical_size: [device.logical_w, device.logical_h],
    render_scale: device.render_scale,
    browser:      browserStr,
    model_id:     modelId,
    temperature:  0,
  },
  transform: {
    dom_to_screen_scale:   1.0,
    safe_area_offset_pt:   [0, device.status_bar_pt],
    content_rect_pt:       [contentX, contentY, contentW, contentH],
    resample_filter:       'lanczos3',
    color:                 'p3->srgb-relative',
  },
  twin_hashes: twinHashes,
  calibration_source: calibrationSource,
  floor: {
    ssim_global:   round4(ssim_global),
    ssim_nontext:  floorSsimNontext,
    deltaE_p95:    floorDeltaE,
    text_iou:      floorTextIou,
    luma_variance: {
      ref: Math.round(varRef * 100) / 100,
      gen: Math.round(varGen * 100) / 100,
      flat_threshold: FLAT_VARIANCE_MAX,
    },
    _text_iou_note: text_iou === null
      ? 'No bbox map provided at calibration time; text_iou is null. ' +
        'Stage 5 will skip the text_iou gate for this calibration.'
      : undefined,
  },
  gate: {
    converged:   gateConverged,
    close:       gateClose,
    gate_explain: gateExplain,
  },
  measured_at: new Date().toISOString(),
};

// Remove undefined keys (e.g. _text_iou_note when text_iou is not null)
const cleanCalib = JSON.parse(JSON.stringify(calibration));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(cleanCalib, null, 2) + '\n', 'utf8');

console.error(`\nCalibration complete. Wrote: ${outPath}`);
process.exit(0);
