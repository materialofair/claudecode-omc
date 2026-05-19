#!/usr/bin/env node
/**
 * evaluate-convergence.mjs — Stage 5: THE sole executable convergence authority
 *
 * This script is the ONLY thing that may emit `convergence/<component>.json`.
 * The LLM orchestrator NEVER hand-writes that artifact — it calls this script,
 * which mechanically decides the verdict and EXITS NON-ZERO on any guard
 * violation so a pipeline cannot ignore a failed gate.
 *
 * Trust model (honest — see spec.md §1.1: report the residual, do not pretend
 * it is zero — and apply that to the skill's OWN trust model):
 *   This grader is mechanically AUTHORITATIVE *given* inputs whose provenance
 *   it now binds in code. Each bullet states ONLY what is mechanically true —
 *   the precise bound/residual split, not an over-claim:
 *     - the structured calibration GATE is recomputed from `calib.floor`
 *       using the published tolerances; a hand-loosened `gate` (tight floor +
 *       loose gate) is rejected (`gate-floor-mismatch`). This binds the gate
 *       TO the floor — it does not bind the floor's *value*;
 *     - `calibration_source` binds the IDENTITY of the bundled twin SOURCE
 *       FILES (excluding build output/dotfiles): their source-tree hashes are
 *       recomputed here from the actual
 *       `assets/calibration/{h5-twin,swiftui-twin}` (mismatch ⇒
 *       `calibration-twin-mismatch`). This does NOT re-measure or bind the
 *       `floor` *value* itself;
 *     - the `floor` VALUE is asserted to satisfy calibrate-render.mjs's OWN
 *       sanity envelope (shared `_calib-consts.mjs`: ssim_nontext ≥ 0.95,
 *       non-null text_iou ≥ 0.9, metric-valid deltaE) — a floor calibrate-
 *       render could not have emitted (it writes blocked.json below this) is
 *       rejected `floor-implausible` (exit 1). The grader does NOT re-render
 *       to re-measure the floor: a floor *within* this envelope yet looser
 *       than the true measured floor is trusted (named residual (2) below);
 *     - the judge negative control is bound to the shipped, hash-pinned
 *       `assets/calibration/swiftui-twin-divergent` SOURCE files (mismatch /
 *       unstructured / not-rejected ⇒ any YES is VOID,
 *       `negative-control-unbound`);
 *     - pHash never short-circuits; null IoU is FAIL; the mask budget is
 *       monotone-or-fail; sim-screenshot.sh carries its own no-fake spine.
 *   NAMED IRREDUCIBLE RESIDUALS (BOTH stated, neither hidden — a fully
 *   zero-trust verdict is impossible because something must run the renders
 *   and something must measure the floor):
 *     (1) The grader CANNOT re-execute the simulator renders. It trusts the
 *         per-iteration pixel-diff JSONs were produced by running the real
 *         `pixel-diff.mjs` on real `sim-screenshot.sh` renders (bounded by
 *         that script's no-fake build/env spine — no simulator / no build ⇒
 *         blocked/needs-human, never converged).
 *     (2) The grader CANNOT re-measure the calibration floor. It asserts the
 *         supplied `floor` satisfies calibrate-render.mjs's own sanity
 *         envelope and recomputes the gate from it, but a `floor` *within*
 *         that envelope yet looser than the TRUE measured floor is trusted
 *         (it cannot re-render the bundled twins to re-derive the real
 *         number). Mitigated by: the orchestrator's contractual obligation
 *         to run the real, sanity/flat-image-spined `calibrate-render.mjs`,
 *         and the human-readable `calibration_provenance` recorded in the
 *         convergence artifact.
 *   These are the deliberate, documented boundaries — the deliverable is
 *   "maximally provenance-bound + honestly disclosed residual", explicitly
 *   NOT "zero-trust". A reviewer reading this header learns BOTH residuals.
 *
 * Usage:
 *   node evaluate-convergence.mjs --iterations iterations.json
 *                                 --calibration calibration.json
 *                                 --judge judge.json
 *                                 --component <Name>
 *                                 [--masks masks.json]
 *                                 [--component-area <WxH | px>]
 *                                 [--out convergence/<Name>.json]
 *                                 [--blocked blocked.json]
 *
 * Inputs:
 *   --iterations <path>  REQUIRED. Either:
 *       (a) a JSON file: [ { "i":1, "diff_json_path":"...", "built":true }, ... ]
 *           where `diff_json_path` points at a pixel-diff.mjs JSON output and
 *           `built` is the caller-supplied build result for that iteration; OR
 *       (b) a directory: every *.json inside is treated as a pixel-diff output;
 *           iteration index = numeric suffix (iterN) or file order; `built`
 *           defaults to true ONLY in directory mode (use form (a) to record
 *           non-building iterations).
 *       The caller supplies `built`; the caller does NOT (and cannot) supply
 *       `gate_passed` — this script computes it.
 *   --calibration <path> REQUIRED. calibrate-render.mjs output. Consumes the
 *       STRUCTURED numeric gate (gate.converged / gate.close objects), never a
 *       string DSL. A legacy string gate is rejected as un-enforceable.
 *       schema MUST be "h5-to-swiftui/calibration@1"; `gate` is REJECTED
 *       unless it equals the gate recomputed from `floor` with the published
 *       tolerances (reason: gate-floor-mismatch); `calibration_source` MUST
 *       match the SHIPPED bundled twins' source-tree hashes recomputed here
 *       (reason: calibration-twin-mismatch).
 *   --judge <path>       REQUIRED. {
 *         "negative_control": {
 *            "stimulus_source_hash": "<sha256 source-tree hash of the
 *                bundled assets/calibration/swiftui-twin-divergent>",
 *            "divergent_pair": "h5-twin vs swiftui-twin-divergent",
 *            "rejected": true,
 *            "differences": [ { "desc": "...", "severity": "..." }, ... ]
 *         },
 *         "framing": "forced-difference-3",
 *         "differences": [ { "desc": "...", "severity": "..." }, ... ],
 *         "verdict": "YES" | "NO" | "visually-equivalent-residual-subperceptual"
 *       }
 *       The legacy bare `negative_control:"passed"` STRING form is REJECTED
 *       as unbound (it asserts a judge run nothing verified) ⇒ any YES VOID.
 *   --masks <path>       Optional. Array of { x, y, w, h, reason }
 *       (component-relative px). Every mask MUST have a non-empty `reason`.
 *   --component-area     Optional. "WxH" (e.g. "320x140") or a raw pixel
 *       integer. Used as the mask-fraction denominator. If omitted, the area
 *       is taken from the first diff's region coverage / global frame if
 *       derivable; if it cannot be derived AND masks are present, that is a
 *       guard violation (cannot verify the mask budget) ⇒ needs-human.
 *   --blocked <path>     Optional. If this file exists, the component is
 *       `blocked` regardless of metrics (never converged).
 *
 * Mechanically enforced guards (each violation ⇒ tier downgrade + non-zero
 * exit, with a machine-readable reason — NEVER a silent pass):
 *   1. Mask budget: sum(mask area)/component area > 0.10 ⇒ needs-human.
 *      Any mask missing a non-empty `reason` ⇒ reject (needs-human).
 *   2. Gate eval in code: read calibration structured thresholds; compute
 *      `gate_passed` PER ITERATION from that iteration's pixel-diff metrics.
 *      A text-region IoU of `null` counts as FAIL (never pass). pHash is
 *      necessary-not-sufficient — phash_fast_candidate never short-circuits
 *      to converged; the region gate must still pass.
 *   3. Monotone-or-fail best-of-N: best_iteration is THIS script's choice,
 *      only among iterations that are BOTH built==true AND gate_passed==true.
 *      Caller-supplied best_iteration is ignored. None ⇒ needs-human.
 *   4. Negative control voids judge — BOUND to the bundled divergent twin:
 *      judge.negative_control MUST be a structured object whose
 *      stimulus_source_hash equals the source-tree hash of the SHIPPED
 *      assets/calibration/swiftui-twin-divergent (recomputed here),
 *      rejected===true, differences a non-empty structured list, AND
 *      judge.framing === "forced-difference-3". The legacy bare string form
 *      is rejected as unbound. Any deviation ⇒ any YES VOID; cannot be
 *      converged (needs-human), recorded negative_control:failed,
 *      reason: negative-control-unbound.
 *   5. Tiered verdict (visual-diff-loop-protocol.md):
 *      converged = gate_passed(best) AND judge YES (valid neg-control);
 *      close     = within the calibration `close` band AND judge
 *                  "visually-equivalent-residual-subperceptual";
 *      else needs-human.
 *   6. Build accounting: no built+gate-passing iteration, or a blocked.json
 *      present ⇒ needs-human / blocked, NEVER converged.
 *
 * Output: writes the `h5-to-swiftui/convergence@1` artifact (pinned-version
 * header pass-through from calibration, full per-iteration history, masks,
 * mask_fraction, negative_control result, best_iteration, tier, residual).
 *
 * Exit codes:
 *   0  — tier is `converged` OR `close` (pipeline may proceed)
 *   1  — fatal error (bad args, file not found, malformed input,
 *         legacy string gate, unverifiable mask budget)
 *   3  — tier is `needs-human` OR a guard was violated (mask budget,
 *         negative control, no gate-passing iteration)
 *   4  — tier is `blocked` (blocked.json present for this component)
 *   (--help exits 0)
 *
 * No npm dependencies — pure JSON; pngjs is NOT required.
 *
 * Examples:
 *   node evaluate-convergence.mjs --iterations iters.json \
 *       --calibration calibration.json --judge judge.json --component ProductCard
 *   node evaluate-convergence.mjs --iterations .h5-to-swiftui/diff/ProductCard \
 *       --calibration calibration.json --judge judge.json --masks masks.json \
 *       --component-area 320x140 --component ProductCard \
 *       --out .h5-to-swiftui/convergence/ProductCard.json
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceTreeHash } from './_provenance.mjs';
// Shared sanity-envelope constants — the SAME module calibrate-render.mjs
// imports, so a `floor` this grader accepts is one calibrate-render could
// actually have emitted (vs writing blocked.json). Single source of truth.
import { floorWithinCalibrateEnvelope } from './_calib-consts.mjs';

// Skill root = parent of this script's directory (scripts/ -> skill root),
// resolved from the script's own location so bundled-asset provenance is
// correct no matter what cwd the grader runs from.
const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_H5_TWIN        = join(SKILL_ROOT, 'assets/calibration/h5-twin');
const BUNDLED_SWIFTUI_TWIN   = join(SKILL_ROOT, 'assets/calibration/swiftui-twin');
const BUNDLED_DIVERGENT_TWIN = join(SKILL_ROOT, 'assets/calibration/swiftui-twin-divergent');

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`evaluate-convergence.mjs — Stage 5 sole executable convergence authority

Usage:
  node evaluate-convergence.mjs --iterations <iters.json | dir>
                                --calibration <calibration.json>
                                --judge <judge.json>
                                --component <Name>
                                [--masks <masks.json>]
                                [--component-area <WxH | px>]
                                [--out <convergence/Name.json>]
                                [--blocked <blocked.json>]

Required:
  --iterations <path>   iterations.json [{i,diff_json_path,built}, ...] OR a
                        directory of pixel-diff.mjs JSON outputs. The caller
                        supplies 'built'; this script computes 'gate_passed'.
  --calibration <path>  calibrate-render.mjs output. STRUCTURED numeric gate
                        (legacy string gate rejected). schema must be
                        h5-to-swiftui/calibration@1; gate must equal the
                        gate recomputed from floor (gate-floor-mismatch);
                        calibration_source must match the bundled twins'
                        source-tree hashes (calibration-twin-mismatch).
  --judge <path>        { negative_control:{stimulus_source_hash,
                        divergent_pair,rejected,differences}, framing,
                        differences, verdict }. The legacy bare
                        negative_control:"passed" string is rejected
                        (unbound) ⇒ any YES VOID.
  --component <Name>    Component name (artifact + best-of-N scope)

Optional:
  --masks <path>        [{x,y,w,h,reason}]; every mask needs a non-empty reason
  --component-area      "WxH" or px integer; mask-fraction denominator
  --out <path>          Where to write convergence/<Name>.json
                        (default: stdout only)
  --blocked <path>      If present, component is 'blocked' (never converged)

Mechanically enforced guards (violation ⇒ downgrade + non-zero exit):
  0 provenance: schema ok; gate == recompute(floor); calibration_source ==
    bundled-twin source-tree hashes (else exit 1 gate-floor-mismatch /
    calibration-twin-mismatch)
  1 mask budget  > 10% ⇒ needs-human; mask w/o reason ⇒ reject
  2 gate eval in code, per iteration; iou null = FAIL; pHash never converges
  3 monotone-or-fail best-of-N: built && gate_passed only; none ⇒ needs-human
  4 negative control BOUND to bundled swiftui-twin-divergent (structured
    {stimulus_source_hash,rejected,differences} + forced-difference-3);
    unbound ⇒ any YES VOID, needs-human, negative-control-unbound
  5 tiered verdict per visual-diff-loop-protocol.md
  6 blocked.json present / no built+passing iter ⇒ never converged

Exit codes:
  0  converged | close            (pipeline may proceed)
  1  fatal error (bad input, legacy string gate, schema mismatch,
     gate-floor-mismatch, calibration-twin-mismatch, unverifiable mask)
  3  needs-human | guard violation
  4  blocked
  (--help exits 0)

No npm deps (pure JSON; pngjs NOT required).

Examples:
  node evaluate-convergence.mjs --iterations iters.json \\
      --calibration calibration.json --judge judge.json --component ProductCard
  node evaluate-convergence.mjs --iterations .h5-to-swiftui/diff/ProductCard \\
      --calibration calibration.json --judge judge.json --masks masks.json \\
      --component-area 320x140 --component ProductCard \\
      --out .h5-to-swiftui/convergence/ProductCard.json
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

const iterationsArg = getFlag('--iterations');
const calibArg      = getFlag('--calibration');
const judgeArg      = getFlag('--judge');
const componentName = getFlag('--component');
const masksArg      = getFlag('--masks');
const areaArg       = getFlag('--component-area');
const outArg        = getFlag('--out');
const blockedArg    = getFlag('--blocked');

function fatal(msg) {
  console.error(`Error: ${msg}\nRun with --help for usage.`);
  process.exit(1);
}

if (!iterationsArg) fatal('--iterations is required.');
if (!calibArg)      fatal('--calibration is required.');
if (!judgeArg)      fatal('--judge is required.');
if (!componentName) fatal('--component is required.');

const iterationsPath = resolve(iterationsArg);
const calibPath      = resolve(calibArg);
const judgePath      = resolve(judgeArg);
const masksPath      = masksArg ? resolve(masksArg) : null;
const blockedPath    = blockedArg ? resolve(blockedArg) : null;

if (!existsSync(iterationsPath)) fatal(`--iterations not found: ${iterationsPath}`);
if (!existsSync(calibPath))      fatal(`--calibration not found: ${calibPath}`);
if (!existsSync(judgePath))      fatal(`--judge not found: ${judgePath}`);
if (masksPath && !existsSync(masksPath)) fatal(`--masks not found: ${masksPath}`);

function readJson(p, label) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fatal(`cannot parse ${label} (${p}): ${e.message}`);
  }
}

// ── Load calibration + validate STRUCTURED gate ───────────────────────────────

const calib = readJson(calibPath, '--calibration');
const gate = calib?.gate;

if (!gate || typeof gate !== 'object') {
  fatal('calibration.json has no `gate` object.');
}
// Reject the legacy string DSL — it is not mechanically enforceable here.
if (typeof gate.converged === 'string' || typeof gate.close === 'string') {
  fatal(
    'calibration.json `gate.converged`/`gate.close` is a legacy STRING DSL. ' +
    'evaluate-convergence.mjs requires the STRUCTURED numeric gate emitted by ' +
    'the current calibrate-render.mjs (objects with ssim_nontext_min, ' +
    'deltaE_p95_max, text_iou_min). Re-run calibration to regenerate.'
  );
}
const gateConverged = gate.converged;
const gateClose     = gate.close;
if (!gateConverged || typeof gateConverged !== 'object'
    || !gateClose || typeof gateClose !== 'object') {
  fatal('calibration.json `gate.converged`/`gate.close` must be numeric objects.');
}
for (const [name, g] of [['converged', gateConverged], ['close', gateClose]]) {
  if (typeof g.ssim_nontext_min !== 'number'
      || typeof g.deltaE_p95_max !== 'number') {
    fatal(`gate.${name} missing numeric ssim_nontext_min / deltaE_p95_max.`);
  }
}

// ── FIX 1: provenance — schema + gate-recomputed-from-floor ───────────────────
// A loose `gate` (tight-looking floor + hand-loosened gate) is one forge
// path. Close it: assert the calibration schema, then RECOMPUTE the
// expected structured gate from `calib.floor` using the SAME published
// tolerances calibrate-render.mjs uses, and reject any deviation beyond a
// tiny rounding epsilon. This binds the GATE to the floor: a hand-loosened
// gate is rejected unless the FLOOR itself is loosened. FIX 2 binds the
// twin SOURCE IDENTITY (not the floor value); FIX A asserts the floor value
// is within calibrate-render's own sanity envelope. A floor *within* that
// envelope but looser than the true measured floor remains trusted
// (residual (2), disclosed in the Trust-model header).

if (calib?.schema !== 'h5-to-swiftui/calibration@1') {
  fatal(
    `calibration.json schema is "${calib?.schema ?? 'absent'}" — expected ` +
    '"h5-to-swiftui/calibration@1". Refusing to grade against an ' +
    'unrecognized calibration contract.'
  );
}

const floor = calib?.floor;
if (!floor || typeof floor !== 'object'
    || typeof floor.ssim_nontext !== 'number'
    || typeof floor.deltaE_p95 !== 'number'
    || !(floor.text_iou === null || typeof floor.text_iou === 'number')) {
  fatal(
    'calibration.json `floor` must carry numeric ssim_nontext + deltaE_p95 ' +
    'and a numeric|null text_iou — cannot recompute the expected gate from ' +
    'an unverifiable floor.'
  );
}

// ── FIX A: floor must satisfy calibrate-render's OWN sanity envelope ──────────
// `calibration_source` (FIX 2) binds the IDENTITY of the bundled twin source
// files but NOT the MEASURED floor values. Without this check an attacker
// could write an absurdly loose floor (e.g. ssim_nontext:0.05,
// deltaE_p95:200), copy the REAL public bundled-twin source hashes into
// `calibration_source`, let the gate recompute consistently from that absurd
// floor, and grade visually-broken output as `converged` with ZERO shipped
// files altered.
//
// calibrate-render.mjs ALREADY refuses to EMIT a floor that fails its sanity
// bound — it writes blocked.json instead of calibration.json. Therefore a
// calibration.json whose `floor` violates that SAME bound could not have been
// produced by an honest calibrate-render.mjs run. We reject it on consistency
// grounds. The envelope constants (SSIM_NONTEXT_MIN=0.95, TEXT_IOU_MIN=0.9)
// come from ./_calib-consts.mjs — the single source of truth calibrate-render
// also imports — so this assertion is provably the same bound the producer
// enforces; no new lenient constant is invented (see _calib-consts.mjs for
// the per-bound provenance: calibrate-render lines ~430/431 +
// render-equivalence-calibration.md §"Sanity bound" + findings RQ4).
//
// This check runs BEFORE the gate-from-floor recompute below, so a fabricated
// floor is rejected before any gate is derived from it. It does NOT close the
// residual entirely: a floor *within* this envelope yet looser than the true
// measured floor is still trusted (the grader cannot re-render to re-measure
// it) — that residual is disclosed honestly in the Trust-model header above
// and in references/*.md / SKILL.md.
{
  const env = floorWithinCalibrateEnvelope(floor);
  if (!env.ok) {
    fatal(
      'floor-implausible: calibration.json `floor` does not satisfy ' +
      "calibrate-render.mjs's OWN sanity envelope, so it could not have " +
      'been produced by an honest calibrate-render.mjs run (that script ' +
      'writes blocked.json — not calibration.json — when the measured ' +
      'floor fails this bound). Refusing to recompute a gate from a floor ' +
      'no real calibration could emit. Details: ' + env.reasons.join('; ')
    );
  }
}

// Published tolerances — MUST stay in sync with calibrate-render.mjs.
const round4 = (v) => Math.round(v * 10000) / 10000;
const D_SSIM   = 0.005;
const D_DELTAE = 0.4;
const D_IOU    = 0.03;
const GATE_EPS = 1e-4; // rounding epsilon (round4 granularity)

const expectGate = {
  converged: {
    ssim_nontext_min: round4(floor.ssim_nontext - D_SSIM),
    deltaE_p95_max:   round4(floor.deltaE_p95 + D_DELTAE),
    text_iou_min:     floor.text_iou === null
      ? null : round4(floor.text_iou - D_IOU),
  },
  close: {
    ssim_nontext_min: round4(floor.ssim_nontext - 2 * D_SSIM),
    deltaE_p95_max:   round4(floor.deltaE_p95 + 2 * D_DELTAE),
    text_iou_min:     floor.text_iou === null
      ? null : round4(floor.text_iou - 2 * D_IOU),
  },
};

function whyNot(v) { return v === undefined ? 'absent' : JSON.stringify(v); }

{
  const mismatches = [];
  for (const tier of ['converged', 'close']) {
    const a = gate[tier], e = expectGate[tier];
    for (const f of ['ssim_nontext_min', 'deltaE_p95_max', 'text_iou_min']) {
      const exp = e[f];
      const act = a?.[f];
      if (exp === null) {
        if (act !== null && act !== undefined) {
          mismatches.push(
            `gate.${tier}.${f}: expected null (floor.text_iou null) but ` +
            `got ${whyNot(act)}`);
        }
        continue;
      }
      if (typeof act !== 'number') {
        mismatches.push(
          `gate.${tier}.${f}: expected ${exp} but got ${whyNot(act)}`);
      } else if (Math.abs(act - exp) > GATE_EPS) {
        mismatches.push(
          `gate.${tier}.${f}: gate=${act} but floor implies ${exp} ` +
          `(|Δ|=${Math.abs(act - exp).toFixed(6)} > ${GATE_EPS})`);
      }
    }
  }
  if (mismatches.length > 0) {
    fatal(
      'gate-floor-mismatch: calibration.json `gate` does not match the ' +
      'gate recomputed from `floor` with the published tolerances ' +
      '(ssim −0.005, deltaE +0.4, text_iou −0.03; close = 2× band). A ' +
      'hand-loosened gate is rejected. Re-run calibrate-render.mjs to ' +
      'regenerate a consistent calibration. Details: ' + mismatches.join('; ')
    );
  }
}

// ── FIX 2: provenance — calibration_source binds the bundled twin IDENTITY ────
// This binds the IDENTITY of the bundled twin SOURCE FILES (excluding build
// output/dotfiles, see _provenance.mjs): recompute the source-tree hash of
// the actual bundled assets and fail closed if calibration.json claims a
// different one. It does NOT re-measure or bind the `floor` *value* — an
// attacker who keeps the real public twin source hashes here but writes a
// loose floor is caught by FIX A's `floor-implausible` envelope check above
// only down to calibrate-render's own sanity floor; a floor within that
// envelope yet looser than the true measured one is residual (2) (disclosed
// in the Trust-model header — NOT claimed closed here).

const calibSource = calib?.calibration_source;
if (!calibSource || typeof calibSource !== 'object') {
  fatal(
    'calibration.json has no `calibration_source` object — cannot bind the ' +
    'floor to the bundled twins. Re-run the current calibrate-render.mjs ' +
    '(it emits calibration_source).'
  );
}
// FIX E (lighter option chosen: DROP the mandatory-presence requirement).
// `twin_hashes` is the SHA-256 of the calibration's input ref/gen PNGs.
// Those PNGs are runtime-rendered and NOT byte-stable across machines, so
// the grader cannot and does not verify `twin_hashes` — it is non-security
// provenance metadata only (the enforced security binding is
// `calibration_source` source-tree hashes + FIX A's sanity envelope).
// Requiring its mere presence verified nothing and falsely inflated the
// apparent binding surface (a reviewer could infer it was load-bearing), so
// the presence gate is removed. It is still passed through to the artifact
// below when present, labelled as non-security metadata.

{
  const actualH5      = sourceTreeHash(BUNDLED_H5_TWIN);
  const actualSwiftUI = sourceTreeHash(BUNDLED_SWIFTUI_TWIN);
  const claimedH5      = calibSource.h5_twin_source_sha256;
  const claimedSwiftUI = calibSource.swiftui_twin_source_sha256;
  const tw = [];
  if (typeof claimedH5 !== 'string' || claimedH5 !== actualH5) {
    tw.push(
      `h5-twin: calibration claims ${whyNot(claimedH5)} but the bundled ` +
      `${BUNDLED_H5_TWIN} source tree hashes to ${actualH5}`);
  }
  if (typeof claimedSwiftUI !== 'string' || claimedSwiftUI !== actualSwiftUI) {
    tw.push(
      `swiftui-twin: calibration claims ${whyNot(claimedSwiftUI)} but the ` +
      `bundled ${BUNDLED_SWIFTUI_TWIN} source tree hashes to ${actualSwiftUI}`);
  }
  if (tw.length > 0) {
    fatal(
      'calibration-twin-mismatch: calibration.json `calibration_source` ' +
      'does not match the SHIPPED, hash-pinned bundled calibration twins. ' +
      'The measured floor must derive from a calibration run against the ' +
      'real bundled pair — refusing to grade against an unbound floor. ' +
      tw.join('; ')
    );
  }
}

// ── Load judge ────────────────────────────────────────────────────────────────

const judge = readJson(judgePath, '--judge');

// ── Load masks ────────────────────────────────────────────────────────────────

let masks = [];
if (masksPath) {
  const raw = readJson(masksPath, '--masks');
  if (!Array.isArray(raw)) fatal('--masks must be a JSON array of {x,y,w,h,reason}.');
  masks = raw;
}

// ── Load iterations ───────────────────────────────────────────────────────────

/**
 * Normalize the --iterations input into [{ i, diff, built }].
 * Form (a): a JSON file [{i,diff_json_path,built}, ...]
 * Form (b): a directory of pixel-diff JSON files (built defaults true).
 */
function loadIterations(p) {
  const st = statSync(p);
  const out = [];
  if (st.isDirectory()) {
    const files = readdirSync(p)
      .filter(f => f.endsWith('.json'))
      .sort();
    let idx = 1;
    for (const f of files) {
      const full = join(p, f);
      const diff = readJson(full, `iteration diff (${f})`);
      const m = f.match(/iter(?:ation)?[-_]?(\d+)/i);
      out.push({
        i: m ? parseInt(m[1], 10) : idx,
        diff,
        diff_json_path: full,
        built: true, // directory mode cannot record non-building iters
      });
      idx++;
    }
    if (out.length === 0) {
      fatal(`--iterations directory has no *.json files: ${p}`);
    }
    return out;
  }

  // File mode
  const spec = readJson(p, '--iterations');
  if (!Array.isArray(spec)) {
    fatal('--iterations file must be an array of {i,diff_json_path,built}.');
  }
  for (const entry of spec) {
    if (typeof entry !== 'object' || entry === null) {
      fatal('--iterations entries must be objects.');
    }
    if (typeof entry.i !== 'number') {
      fatal('--iterations entry missing numeric `i`.');
    }
    if (typeof entry.built !== 'boolean') {
      fatal(`--iterations entry i=${entry.i} missing boolean \`built\`.`);
    }
    let diff = null;
    if (entry.diff_json_path) {
      const dp = resolve(dirname(p), entry.diff_json_path);
      const dp2 = existsSync(dp) ? dp : resolve(entry.diff_json_path);
      if (!existsSync(dp2)) {
        fatal(`iteration i=${entry.i} diff_json_path not found: ${entry.diff_json_path}`);
      }
      diff = readJson(dp2, `iteration i=${entry.i} diff`);
    } else if (entry.diff && typeof entry.diff === 'object') {
      diff = entry.diff; // inline diff allowed
    } else {
      fatal(`iteration i=${entry.i} has neither diff_json_path nor inline diff.`);
    }
    out.push({ i: entry.i, diff, diff_json_path: entry.diff_json_path ?? null, built: entry.built });
  }
  if (out.length === 0) fatal('--iterations is empty.');
  return out;
}

const iterations = loadIterations(iterationsPath);

// ── Component area (mask-fraction denominator) ────────────────────────────────

/**
 * Resolve the component pixel area. Precedence:
 *   1. --component-area "WxH" or px integer
 *   2. derive from a diff's global frame if it exposes width*height
 * Returns { area:number|null, source:string }.
 */
function resolveComponentArea() {
  if (areaArg) {
    const wh = areaArg.match(/^(\d+)\s*[xX*]\s*(\d+)$/);
    if (wh) {
      return { area: parseInt(wh[1], 10) * parseInt(wh[2], 10), source: `flag ${areaArg}` };
    }
    const px = areaArg.match(/^\d+$/);
    if (px) return { area: parseInt(areaArg, 10), source: `flag ${areaArg}px` };
    fatal(`--component-area must be "WxH" or a pixel integer (got "${areaArg}").`);
  }
  // Try to derive from a diff frame if any iteration exposes it.
  for (const it of iterations) {
    const d = it.diff;
    if (d && typeof d.frame_w === 'number' && typeof d.frame_h === 'number') {
      return { area: d.frame_w * d.frame_h, source: `diff frame i=${it.i}` };
    }
  }
  return { area: null, source: 'unresolved' };
}

const { area: componentArea, source: areaSource } = resolveComponentArea();

// ── GUARD 1: mask budget ──────────────────────────────────────────────────────

const guardReasons = [];
let maskFraction = null;
let maskBudgetViolated = false;

for (const m of masks) {
  if (typeof m.x !== 'number' || typeof m.y !== 'number'
      || typeof m.w !== 'number' || typeof m.h !== 'number') {
    guardReasons.push('mask-malformed: a mask is missing numeric x/y/w/h');
    maskBudgetViolated = true;
  }
  if (typeof m.reason !== 'string' || m.reason.trim() === '') {
    guardReasons.push('mask-no-reason: every mask must declare a non-empty reason');
    maskBudgetViolated = true;
  }
}

if (masks.length > 0) {
  if (componentArea === null || componentArea <= 0) {
    // Cannot verify the budget — refuse to silently pass. This is fatal:
    // an unverifiable mask budget is an input error the caller must fix.
    fatal(
      'masks supplied but component area is unknown (pass --component-area ' +
      '"WxH"). Cannot verify the 10% mask budget — refusing to proceed ' +
      'rather than silently pass.'
    );
  }
  const maskedPixels = masks.reduce(
    (s, m) => s + Math.max(0, m.w) * Math.max(0, m.h), 0);
  maskFraction = maskedPixels / componentArea;
  maskFraction = Math.round(maskFraction * 10000) / 10000;
  if (maskFraction > 0.10) {
    maskBudgetViolated = true;
    guardReasons.push(
      `mask-budget: masked fraction ${maskFraction} > 0.10 ` +
      `(${maskedPixels}px / ${componentArea}px area via ${areaSource})`);
  }
} else {
  maskFraction = 0;
}

// ── GUARD 2: gate eval in code, per iteration ─────────────────────────────────

/**
 * Evaluate the structured gate against one pixel-diff output.
 * Rules (visual-diff-loop-protocol.md, made executable here):
 *   - non-text regions: every region's ssim >= g.ssim_nontext_min AND
 *     deltaE_p95 <= g.deltaE_p95_max; if no non-text regions, fall back to
 *     diff.global_ssim against ssim_nontext_min.
 *   - text regions: if g.text_iou_min is null the IoU sub-gate is SKIPPED
 *     (calibration had no bbox map). Otherwise EVERY text region must have a
 *     numeric iou >= g.text_iou_min. An iou of `null` is a FAIL, never a pass.
 *   - pHash is necessary-not-sufficient: phash_fast_candidate is NEVER a
 *     short-circuit to pass. The region gate above is the sole authority.
 * Returns { passed:boolean, detail:string }.
 */
function evalGate(diff, g) {
  const reasons = [];
  if (!diff || typeof diff !== 'object') {
    return { passed: false, detail: 'diff missing/not an object' };
  }
  const regions = diff.regions ?? {};
  const nontext = Array.isArray(regions.nontext) ? regions.nontext : [];
  const text    = Array.isArray(regions.text) ? regions.text : [];

  // Non-text sub-gate.
  if (nontext.length > 0) {
    for (const r of nontext) {
      if (typeof r.ssim !== 'number' || r.ssim < g.ssim_nontext_min) {
        reasons.push(
          `nontext mark ${r.mark ?? '?'} ssim ${r.ssim ?? 'n/a'} < ` +
          `${g.ssim_nontext_min}`);
      }
      if (typeof r.deltaE_p95 === 'number' && r.deltaE_p95 > g.deltaE_p95_max) {
        reasons.push(
          `nontext mark ${r.mark ?? '?'} deltaE_p95 ${r.deltaE_p95} > ` +
          `${g.deltaE_p95_max}`);
      }
    }
  } else {
    const gs = diff.global_ssim;
    if (typeof gs !== 'number' || gs < g.ssim_nontext_min) {
      reasons.push(
        `no nontext regions; global_ssim ${gs ?? 'n/a'} < ` +
        `${g.ssim_nontext_min}`);
    }
  }

  // Text sub-gate — only when calibration provided a text_iou floor.
  if (g.text_iou_min !== null && g.text_iou_min !== undefined) {
    if (text.length === 0) {
      // No text regions measured but gate expects one — cannot confirm pass.
      reasons.push(
        `text_iou gate active (min ${g.text_iou_min}) but diff has no text ` +
        `regions to verify`);
    }
    for (const r of text) {
      if (r.iou === null || r.iou === undefined) {
        reasons.push(
          `text mark ${r.mark ?? '?'} iou is null — counts as FAIL ` +
          `(no generated bbox supplied to pixel-diff)`);
      } else if (typeof r.iou !== 'number' || r.iou < g.text_iou_min) {
        reasons.push(
          `text mark ${r.mark ?? '?'} iou ${r.iou} < ${g.text_iou_min}`);
      }
    }
  }

  return {
    passed: reasons.length === 0,
    detail: reasons.length === 0 ? 'all sub-gates passed' : reasons.join('; '),
  };
}

const history = [];
for (const it of iterations) {
  const conv = evalGate(it.diff, gateConverged);
  const cls  = evalGate(it.diff, gateClose);
  history.push({
    i: it.i,
    built: it.built,
    gate_passed: it.built && conv.passed,           // gate only counts if built
    close_band_passed: it.built && cls.passed,
    phash_fast_candidate: it.diff?.phash_fast_candidate === true,
    gate_detail: conv.detail,
    diff_json_path: it.diff_json_path,
    diff_summary: {
      global_ssim: it.diff?.global_ssim ?? null,
      phash_hamming: it.diff?.phash_hamming ?? null,
      diff_pixel_fraction: it.diff?.diff_pixel_fraction ?? null,
    },
  });
}

// ── GUARD 3: monotone-or-fail best-of-N (this script's choice) ────────────────
// Only iterations that are BOTH built==true AND gate_passed==true are eligible.
// Caller-supplied best_iteration is ignored entirely.

const eligible = history.filter(h => h.built === true && h.gate_passed === true);
let bestIteration = null;
if (eligible.length > 0) {
  // Pick the eligible iteration with the highest global_ssim, then lowest
  // diff_pixel_fraction, then highest index (latest correction wins ties).
  eligible.sort((a, b) => {
    const sa = a.diff_summary.global_ssim ?? -Infinity;
    const sb = b.diff_summary.global_ssim ?? -Infinity;
    if (sb !== sa) return sb - sa;
    const fa = a.diff_summary.diff_pixel_fraction ?? Infinity;
    const fb = b.diff_summary.diff_pixel_fraction ?? Infinity;
    if (fa !== fb) return fa - fb;
    return b.i - a.i;
  });
  bestIteration = eligible[0].i;
}

// close-band best (used only if no converged-eligible iteration exists)
const closeEligible = history.filter(
  h => h.built === true && h.close_band_passed === true);
let bestCloseIteration = null;
if (closeEligible.length > 0) {
  closeEligible.sort((a, b) =>
    (b.diff_summary.global_ssim ?? -Infinity) -
    (a.diff_summary.global_ssim ?? -Infinity) || b.i - a.i);
  bestCloseIteration = closeEligible[0].i;
}

// A built result candidate is either a converged-gate-passing iteration OR a
// built close-band-passing iteration. `needs-human` for "no passing iteration"
// only when NEITHER exists — a close-band iteration is still a legitimate
// (honest-accept) candidate and must not be force-failed before the close tier
// is even evaluated.
const hasBuiltPassing = bestIteration !== null;
const hasAnyBuiltCandidate = bestIteration !== null || bestCloseIteration !== null;

// ── GUARD 4: negative control voids judge — BOUND to the bundled twin ─────────
// FIX 3: the negative control must be a STRUCTURED artifact bound to the
// shipped, hash-pinned `assets/calibration/swiftui-twin-divergent`. The old
// bare `negative_control:"passed"` string is no longer accepted (it asserts
// a judge run that nothing verified) — it is treated as UNBOUND ⇒ any YES
// is VOID. The judge must demonstrate it rejected the KNOWN-divergent pair
// (whose stimulus hash this script recomputes from the shipped asset) under
// the adversarial forced-difference-3 framing with structured differences.
//
//   judge.negative_control = {
//     stimulus_source_hash: "<sha256 source-tree hash of the bundled
//                             swiftui-twin-divergent>",
//     divergent_pair: "h5-twin vs swiftui-twin-divergent",
//     rejected: true,
//     differences: [ { desc, severity }, ... ]   // non-empty, structured
//   }

const expectedDivergentHash = sourceTreeHash(BUNDLED_DIVERGENT_TWIN);
const nc = judge?.negative_control;
const ncReasons = [];

if (typeof nc === 'string') {
  ncReasons.push(
    `negative-control-unbound: judge.negative_control is the legacy bare ` +
    `string "${nc}" — an unbound assertion of a judge run nothing verified. ` +
    `A STRUCTURED, hash-bound negative_control object is required; any YES ` +
    `is VOID`);
} else if (!nc || typeof nc !== 'object') {
  ncReasons.push(
    `negative-control-unbound: judge.negative_control is ` +
    `${nc === undefined ? 'absent' : 'not an object'} — a STRUCTURED, ` +
    `hash-bound negative_control object is required; any YES is VOID`);
} else {
  if (typeof nc.stimulus_source_hash !== 'string'
      || nc.stimulus_source_hash !== expectedDivergentHash) {
    ncReasons.push(
      `negative-control-unbound: negative_control.stimulus_source_hash=` +
      `${whyNot(nc.stimulus_source_hash)} != the bundled ` +
      `swiftui-twin-divergent source-tree hash ${expectedDivergentHash} ` +
      `(${BUNDLED_DIVERGENT_TWIN}) — the judge was not shown the shipped, ` +
      `hash-pinned divergent stimulus; any YES is VOID`);
  }
  if (nc.rejected !== true) {
    ncReasons.push(
      `negative-control-unbound: negative_control.rejected=` +
      `${whyNot(nc.rejected)} (must be boolean true — the judge MUST have ` +
      `rejected the known-divergent pair); any YES is VOID`);
  }
  if (!Array.isArray(nc.differences) || nc.differences.length === 0
      || !nc.differences.every(d =>
           d && typeof d === 'object'
           && typeof d.desc === 'string' && d.desc.trim() !== ''
           && typeof d.severity === 'string' && d.severity.trim() !== '')) {
    ncReasons.push(
      `negative-control-unbound: negative_control.differences must be a ` +
      `non-empty array of structured {desc,severity} entries (proof the ` +
      `judge enumerated real divergences, not a bare pass); any YES is VOID`);
  }
}

if (judge?.framing !== 'forced-difference-3') {
  ncReasons.push(
    `judge-framing: judge.framing="${judge?.framing ?? 'absent'}" != ` +
    `"forced-difference-3" — adversarial framing not confirmed; YES is VOID`);
}

const negControlPassed = ncReasons.length === 0;
const negControlResult = negControlPassed ? 'passed' : 'failed';
if (!negControlPassed) {
  for (const r of ncReasons) guardReasons.push(r);
}

const judgeVerdictRaw = String(judge?.verdict ?? '').trim();
const judgeYes = negControlPassed && judgeVerdictRaw.toUpperCase() === 'YES';
const judgeEquiv = negControlPassed &&
  judgeVerdictRaw.toLowerCase() === 'visually-equivalent-residual-subperceptual';

// ── GUARD 6 + tier decision ───────────────────────────────────────────────────

const blockedPresent = blockedPath !== null && existsSync(blockedPath);

let tier;
let tierReason;

if (blockedPresent) {
  tier = 'blocked';
  tierReason = `blocked.json present (${blockedPath}) — never converged`;
} else if (maskBudgetViolated) {
  tier = 'needs-human';
  tierReason = `mask-guard violated: ${guardReasons.join(' | ')}`;
} else if (!hasAnyBuiltCandidate) {
  tier = 'needs-human';
  tierReason =
    'no iteration is BOTH built and gate/close-band passing ' +
    '(monotone-or-fail): ' +
    history.map(h =>
      `i${h.i}[built=${h.built},gate=${h.gate_passed},` +
      `close=${h.close_band_passed}]`).join(' ');
} else if (!negControlPassed) {
  tier = 'needs-human';
  tierReason =
    'negative control not bound / adversarial framing not satisfied — ' +
    `judge verdict VOID: ${ncReasons.join(' | ')}`;
} else if (hasBuiltPassing && judgeYes) {
  tier = 'converged';
  tierReason =
    `gate_passed(best i=${bestIteration}) AND judge YES with valid ` +
    `negative control`;
} else if (bestCloseIteration !== null && judgeEquiv) {
  tier = 'close';
  // The close-band iteration is the result candidate for this tier.
  bestIteration = bestCloseIteration;
  tierReason =
    `within calibration close band (best i=${bestCloseIteration}) AND judge ` +
    `visually-equivalent-residual-subperceptual (honest accept)`;
} else {
  tier = 'needs-human';
  tierReason = hasBuiltPassing
    ? `gate-passing iteration exists (i=${bestIteration}) but judge verdict ` +
      `"${judgeVerdictRaw || 'absent'}" is not YES`
    : `only a close-band iteration exists (i=${bestCloseIteration}) but ` +
      `judge verdict "${judgeVerdictRaw || 'absent'}" is not ` +
      `visually-equivalent-residual-subperceptual`;
}

// ── Residual (from the chosen best iteration's diff) ──────────────────────────

function residualFor(iterIndex) {
  if (iterIndex === null) return null;
  const it = iterations.find(x => x.i === iterIndex);
  if (!it || !it.diff) return null;
  const d = it.diff;
  const nontext = d.regions?.nontext ?? [];
  const text = d.regions?.text ?? [];
  const minSsim = nontext.length
    ? Math.min(...nontext.map(r => (typeof r.ssim === 'number' ? r.ssim : 1)))
    : (typeof d.global_ssim === 'number' ? d.global_ssim : null);
  const maxDeltaE = nontext.length
    ? Math.max(...nontext.map(r => (typeof r.deltaE_p95 === 'number' ? r.deltaE_p95 : 0)))
    : null;
  const ious = text
    .map(r => r.iou)
    .filter(v => typeof v === 'number');
  const minIou = ious.length ? Math.min(...ious) : null;
  return {
    ssim_nontext: minSsim,
    deltaE_p95: maxDeltaE,
    text_iou: minIou,
  };
}

// ── Assemble artifact (schema: h5-to-swiftui/convergence@1) ───────────────────

const artifact = {
  schema: 'h5-to-swiftui/convergence@1',
  component: componentName,
  // pinned-version header pass-through from calibration (do not re-derive)
  pinned: calib.pinned ?? null,
  calibration_floor: calib.floor
    ? {
        ssim_nontext: calib.floor.ssim_nontext ?? null,
        deltaE_p95: calib.floor.deltaE_p95 ?? null,
        text_iou: calib.floor.text_iou ?? null,
      }
    : null,
  gate: { converged: gateConverged, close: gateClose },
  iterations: history.map(h => ({
    i: h.i,
    diff: h.diff_summary,
    built: h.built,
    gate_passed: h.gate_passed,
    close_band_passed: h.close_band_passed,
    phash_fast_candidate: h.phash_fast_candidate,
    gate_detail: h.gate_detail,
    ...(h.diff_json_path ? { diff_json_path: h.diff_json_path } : {}),
  })),
  masks: masks.map(m => ({
    x: m.x, y: m.y, w: m.w, h: m.h, reason: m.reason,
  })),
  mask_fraction: maskFraction,
  mask_budget: 0.10,
  component_area_px: componentArea,
  component_area_source: areaSource,
  judge: {
    negative_control: negControlResult,
    negative_control_binding: {
      expected_divergent_source_sha256: expectedDivergentHash,
      claimed_stimulus_source_hash:
        (nc && typeof nc === 'object') ? (nc.stimulus_source_hash ?? null)
                                       : null,
      rejected: (nc && typeof nc === 'object') ? (nc.rejected ?? null) : null,
      bound: negControlPassed,
      reasons: ncReasons,
    },
    framing: judge?.framing ?? null,
    differences: Array.isArray(judge?.differences) ? judge.differences : [],
    verdict: judgeVerdictRaw || null,
    verdict_honored: negControlPassed,
  },
  // Provenance binding asserted by this run. Precisely: the GATE was
  // recomputed from `floor`; the bundled twin SOURCE IDENTITY was verified;
  // the `floor` VALUE was asserted within calibrate-render's own sanity
  // envelope. The floor value itself is NOT re-measured by the grader — see
  // `residual_disclosure` below for the two named irreducible residuals.
  calibration_provenance: {
    schema_ok: true,
    gate_recomputed_from_floor: true,
    floor_within_calibrate_sanity_envelope: true, // FIX A: floor-implausible
    calibration_source: {
      h5_twin_source_sha256: calibSource.h5_twin_source_sha256 ?? null,
      swiftui_twin_source_sha256:
        calibSource.swiftui_twin_source_sha256 ?? null,
      // binds the twin SOURCE-FILE identity (excl. build output/dotfiles),
      // NOT the measured floor value
      twin_source_identity_verified_against_bundled: true,
    },
    // FIX E: twin_hashes is the SHA-256 of runtime-rendered ref/gen PNGs
    // which are NOT byte-stable across machines; it is non-security
    // provenance metadata only (NOT verified by the grader; the security
    // binding is calibration_source + the sanity envelope).
    twin_hashes_note:
      'non-security provenance metadata (input PNG hashes, not byte-stable ' +
      'across machines, not verified by the grader)',
    twin_hashes: (calib && typeof calib.twin_hashes === 'object')
      ? calib.twin_hashes : null,
    // FIX C: BOTH named irreducible residuals, disclosed in the artifact.
    residual_disclosure: {
      residual_1_renders_not_re_executed:
        'the grader cannot re-execute the simulator renders; it trusts the ' +
        'per-iteration pixel-diff JSONs came from real pixel-diff.mjs on ' +
        'real sim-screenshot.sh renders (bounded by that script no-fake spine)',
      residual_2_floor_not_re_measured:
        'the grader cannot re-measure the calibration floor; it asserts the ' +
        "supplied floor is within calibrate-render.mjs's own sanity envelope " +
        'and recomputes the gate from it, but a floor within that envelope ' +
        'yet looser than the true measured floor is trusted (mitigated by ' +
        'the orchestrator obligation to run the real calibrate-render.mjs ' +
        'and this calibration_provenance record)',
    },
  },
  guard_violations: guardReasons,
  best_iteration: bestIteration,
  tier,
  tier_reason: tierReason,
  residual: residualFor(bestIteration),
  evaluated_at: new Date().toISOString(),
};

const json = JSON.stringify(artifact, null, 2) + '\n';

if (outArg) {
  const outPath = resolve(outArg);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, 'utf8');
  console.error(`Wrote convergence artifact: ${outPath}`);
}

process.stdout.write(json);

// ── Exit code reflects the verdict (a pipeline cannot ignore a failure) ───────

console.error(
  `tier=${tier} best_iteration=${bestIteration ?? 'none'} ` +
  `mask_fraction=${maskFraction} negative_control=${negControlResult}`);
console.error(`reason: ${tierReason}`);

if (tier === 'converged' || tier === 'close') {
  process.exit(0);
}
if (tier === 'blocked') {
  process.exit(4);
}
// needs-human or any guard violation
process.exit(3);
