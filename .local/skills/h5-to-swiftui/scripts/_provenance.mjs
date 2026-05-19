/**
 * _provenance.mjs — Shared provenance binding for h5-to-swiftui calibration.
 *
 * Single source of truth for the deterministic source-tree hash used to bind
 * the IDENTITY of the SHIPPED bundled calibration twin SOURCE FILES (NOT the
 * measured `floor` value) into a `calibration.json`. Both
 * `calibrate-render.mjs` (producer) and `evaluate-convergence.mjs` (consumer)
 * import THIS function so the hash is computed identically on both sides.
 *
 * Scope of what this binds (precise — no over-claim): it binds the *identity*
 * of the bundled twin source files. It does NOT bind the measured `floor`
 * value: an attacker who keeps the real, public, unmodified bundled-twin
 * source hashes but writes a loose `floor` is NOT caught by this hash. The
 * grader narrows that path with FIX A (the floor must satisfy
 * calibrate-render's own sanity envelope, see `_calib-consts.mjs`); a floor
 * *within* that envelope yet looser than the true measured floor is a
 * disclosed irreducible residual (the grader cannot re-render to re-measure
 * it). See the Trust-model header in `evaluate-convergence.mjs`.
 *
 * Why a source-tree hash (not the rendered PNG hash):
 *   The rendered PNGs are produced at runtime by sim-screenshot.sh /
 *   capture-reference.mjs and will NOT be byte-identical across machines
 *   (renderer/OS/font differences). The SOURCE the calibration must derive
 *   from is fixed and shippable, so we content-hash the source tree instead.
 *
 * Determinism rules (must hold across OS / cwd / clone):
 *   - file list is sorted by POSIX relative path (forward slashes)
 *   - each file contributes: `<relpath>\0<sha256-of-bytes>\n`
 *   - directories that do not exist contribute a sentinel (so a missing tree
 *     is detected, never silently treated as "matches")
 *   - the `.build/`, `.swiftpm/`, `xcuserdata/` SwiftPM artifact dirs and
 *     dotfiles are excluded (gitignored build output, not source) — so what
 *     is pinned is the SOURCE FILES (excluding build output/dotfiles), not
 *     the whole on-disk tree; see the EXCLUSION RATIONALE on SKIP_DIR below
 *
 * No npm dependencies — node:crypto + node:fs + node:path only.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

// EXCLUSION RATIONALE (FIX D — MAJOR-1, precise):
// Excluded-path content — dotfiles/dotdirs (the `name.startsWith('.')` skip
// in walk()), `.git`, `.build`, `.swiftpm`, `xcuserdata`, `node_modules`
// (this SKIP_DIR set) — is INTENTIONALLY NOT bound by the source-tree hash.
// This is SAFE FOR THE BUNDLED CALIBRATION ASSETS SPECIFICALLY because those
// trees (`assets/calibration/{h5-twin,swiftui-twin,swiftui-twin-divergent}`)
// are HTML/CSS/Swift SOURCE containing no dotfiles, and `.build/` /
// `.swiftpm/` / `xcuserdata/` are gitignored SwiftPM/Xcode BUILD OUTPUT (not
// source) that is regenerated per machine and would make the hash unstable.
// Consequence (stated, not hidden): only the bundled twin SOURCE FILES are
// hash-pinned — build output and dotfiles are not. For non-source-only trees
// this exclusion would be a gap; for the calibration assets it is correct by
// construction (see assets/calibration/.gitignore + README.md).
const SKIP_DIR = new Set(['.build', '.swiftpm', 'xcuserdata', '.git', 'node_modules']);

/** Recursively collect files under `dir` as POSIX relpaths (sorted). */
function walk(dir, base, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const name = e.name;
    if (name.startsWith('.')) continue;          // dotfiles/dotdirs excluded
    if (e.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(join(dir, name), base, acc);
    } else if (e.isFile()) {
      const rel = relative(base, join(dir, name)).split(sep).join('/');
      acc.push(rel);
    }
  }
}

/**
 * Deterministic SHA-256 content hash of a source tree.
 * Returns a 64-hex string. A non-existent directory yields a STABLE sentinel
 * hash of the literal string `__MISSING__:<basename>` so absence is bound
 * (never confused with a real tree).
 */
export function sourceTreeHash(dir) {
  const h = createHash('sha256');
  if (!existsSync(dir)) {
    const baseName = dir.split(sep).filter(Boolean).pop() ?? dir;
    h.update(`__MISSING__:${baseName}`);
    return h.digest('hex');
  }
  let st;
  try {
    st = statSync(dir);
  } catch {
    h.update('__UNSTATABLE__');
    return h.digest('hex');
  }
  if (!st.isDirectory()) {
    // A file where a directory was expected — bind that fact deterministically.
    h.update('__NOT_A_DIR__:');
    h.update(createHash('sha256').update(readFileSync(dir)).digest('hex'));
    return h.digest('hex');
  }
  const files = [];
  walk(dir, dir, files);
  files.sort();
  for (const rel of files) {
    const bytesHash = createHash('sha256')
      .update(readFileSync(join(dir, rel)))
      .digest('hex');
    h.update(rel);
    h.update('\0');
    h.update(bytesHash);
    h.update('\n');
  }
  return h.digest('hex');
}

/** SHA-256 of a single file's raw bytes (64-hex). */
export function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
