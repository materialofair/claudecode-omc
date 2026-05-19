/**
 * _calib-consts.mjs — Single source of truth for the calibration sanity
 * envelope shared by the PRODUCER (`calibrate-render.mjs`) and the CONSUMER
 * (`evaluate-convergence.mjs`).
 *
 * Why this module exists (audit #3 CRITICAL-1):
 *   `calibration_source` binds the *identity* of the bundled twin source
 *   files but NOT the *measured floor values*. Without this module an
 *   attacker could write an absurdly loose `floor`
 *   (e.g. ssim_nontext:0.05, deltaE_p95:200), copy the REAL public bundled
 *   twin source hashes into `calibration_source`, let the gate recompute
 *   from that absurd floor, and grade visually-broken output as converged
 *   with ZERO shipped files altered.
 *
 *   `calibrate-render.mjs` ALREADY refuses to EMIT a `floor` that fails its
 *   own sanity bound — it writes `blocked.json` instead of
 *   `calibration.json`. Therefore a `calibration.json` whose `floor`
 *   violates that same bound *could not have been produced by an honest
 *   `calibrate-render.mjs` run*. The grader may reject it on
 *   consistency grounds. This module hoists the EXACT constants
 *   `calibrate-render.mjs` already enforces so producer and consumer use a
 *   SINGLE source of truth (mirrors how `_provenance.mjs` shares hashing).
 *
 * Provenance of each bound (NO new lenient constant is invented here — every
 * number is exactly what `calibrate-render.mjs` already enforces, cited):
 *
 *   - SSIM_NONTEXT_MIN = 0.95
 *       Source: `calibrate-render.mjs` `const SSIM_NONTEXT_MIN = 0.95;`
 *       (the ssim_nontext sanity floor it refuses to emit below) and
 *       `references/render-equivalence-calibration.md` §"Sanity bound"
 *       (`ssim_nontext ≥ 0.95`), itself derived from `findings.md` RQ4
 *       ("SSIM ... < 0.92 = fail"; 0.95 is the conservative measurable
 *       floor, not the 0.995 same-renderer regression value §1.1 warns
 *       against). An honest calibrate-render run NEVER emits
 *       floor.ssim_nontext < 0.95.
 *
 *   - TEXT_IOU_MIN = 0.9
 *       Source: `calibrate-render.mjs` `const TEXT_IOU_MIN = 0.9;` (the
 *       text_iou sanity floor it enforces *when text_iou is non-null*;
 *       skipped when null because no bbox map exists at calibration time)
 *       and `references/render-equivalence-calibration.md` §"Sanity bound"
 *       (`text_iou ≥ 0.9`). An honest calibrate-render run NEVER emits a
 *       non-null floor.text_iou < 0.9.
 *
 *   - deltaE_p95: there is DELIBERATELY no shared maximum here.
 *       `calibrate-render.mjs`'s sanity bound (its `ssimFails`/`textIouFails`
 *       /`flatFails` block) does NOT bound deltaE_p95 from above — it only
 *       gates ssim_nontext, text_iou, and the flat-image variance guard.
 *       Inventing a deltaE ceiling here would be a NEW lenient constant with
 *       no producer-side counterpart, which the task explicitly forbids
 *       ("Derive any envelope numbers ONLY from what calibrate-render
 *       already enforces ... do NOT invent a new lenient constant").
 *       The only deltaE assertion the consumer may make is the
 *       metric-validity one below (finite and ≥ 0) — a CIEDE2000 ΔE is a
 *       non-negative real; a negative/NaN/Infinity value could not be a real
 *       `ciede2000Region` output. This is a validity check, not a lenient
 *       tolerance, so it is principled.
 *
 * No npm dependencies — plain constants + a pure validator.
 */

// ── Sanity-envelope constants (verbatim from calibrate-render.mjs) ────────────
//
// calibrate-render.mjs line ~430: `const SSIM_NONTEXT_MIN = 0.95;`
export const SSIM_NONTEXT_MIN = 0.95;
// calibrate-render.mjs line ~431: `const TEXT_IOU_MIN = 0.9;`
export const TEXT_IOU_MIN = 0.9;

/**
 * Validate a `calibration.json` `floor` against the SAME sanity envelope
 * `calibrate-render.mjs` enforces before it is willing to EMIT a
 * `calibration.json` (vs writing `blocked.json`).
 *
 * Returns { ok:true } or { ok:false, reasons:[...] }. Pure; no I/O.
 *
 * What is asserted (all derived from calibrate-render's own behavior):
 *   1. ssim_nontext is a finite number in [0,1] AND ≥ SSIM_NONTEXT_MIN.
 *      (calibrate-render writes blocked.json, not calibration.json, when
 *       ssim_nontext < SSIM_NONTEXT_MIN — so a real run never emits below it.)
 *   2. deltaE_p95 is a finite number ≥ 0. (A CIEDE2000 ΔE is a non-negative
 *      real; calibrate-render imposes no UPPER deltaE bound, so neither does
 *      the grader — only metric validity, not a lenient tolerance.)
 *   3. text_iou is null OR a finite number in [0,1]; when non-null it must be
 *      ≥ TEXT_IOU_MIN (calibrate-render's textIouFails gate, skipped on null).
 *
 * A `floor` failing ANY of these could not have been produced by an honest
 * `calibrate-render.mjs` run (it would have written blocked.json), so the
 * grader rejects it as `floor-implausible` rather than recomputing a gate
 * from a fabricated floor.
 */
export function floorWithinCalibrateEnvelope(floor) {
  const reasons = [];

  if (!floor || typeof floor !== 'object') {
    return { ok: false, reasons: ['floor is absent or not an object'] };
  }

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // 1. ssim_nontext — calibrate-render's SSIM_NONTEXT_MIN sanity floor.
  const s = floor.ssim_nontext;
  if (!finite(s)) {
    reasons.push(
      `floor.ssim_nontext=${JSON.stringify(s)} is not a finite number ` +
      `(SSIM is a real in [0,1]; not a producible calibrate-render output)`);
  } else if (s < 0 || s > 1) {
    reasons.push(
      `floor.ssim_nontext=${s} is outside the valid SSIM range [0,1] ` +
      `(not a producible calibrate-render output)`);
  } else if (s < SSIM_NONTEXT_MIN) {
    reasons.push(
      `floor.ssim_nontext=${s} < calibrate-render sanity minimum ` +
      `${SSIM_NONTEXT_MIN} — calibrate-render writes blocked.json (not ` +
      `calibration.json) below this, so this floor could not be a real run`);
  }

  // 2. deltaE_p95 — metric validity only (no producer-side upper bound).
  const d = floor.deltaE_p95;
  if (!finite(d)) {
    reasons.push(
      `floor.deltaE_p95=${JSON.stringify(d)} is not a finite number ` +
      `(CIEDE2000 ΔE is a finite non-negative real; not a producible output)`);
  } else if (d < 0) {
    reasons.push(
      `floor.deltaE_p95=${d} is negative — a CIEDE2000 ΔE is non-negative ` +
      `(not a producible calibrate-render output)`);
  }

  // 3. text_iou — null is valid (no bbox map); when non-null,
  //    calibrate-render's TEXT_IOU_MIN sanity floor applies.
  const t = floor.text_iou;
  if (t === null) {
    // valid — calibrate-render emits null when no bbox map exists.
  } else if (!finite(t)) {
    reasons.push(
      `floor.text_iou=${JSON.stringify(t)} is neither null nor a finite ` +
      `number (not a producible calibrate-render output)`);
  } else if (t < 0 || t > 1) {
    reasons.push(
      `floor.text_iou=${t} is outside the valid IoU range [0,1] ` +
      `(not a producible calibrate-render output)`);
  } else if (t < TEXT_IOU_MIN) {
    reasons.push(
      `floor.text_iou=${t} < calibrate-render sanity minimum ` +
      `${TEXT_IOU_MIN} — calibrate-render writes blocked.json below this ` +
      `for a non-null text_iou, so this floor could not be a real run`);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
