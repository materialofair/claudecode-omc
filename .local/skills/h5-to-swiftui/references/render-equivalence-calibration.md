# Stage 2.5 — Render-Equivalence Calibration

**Why this exists.** A simulator screenshot and a Playwright screenshot of
the "same" screen are *not* comparable rasters. Diffing them directly makes
every metric meaningless and the loop oscillates on non-defects. Calibration
defines the exact normalization that makes them comparable, and **measures
the best achievable cross-renderer agreement** so Stage 5 gates against a
real number instead of an asserted constant.

## The non-comparability sources (all must be neutralized)

| Source | H5 (Playwright/WebKit) | iOS (simctl/SwiftUI) | Fix |
|---|---|---|---|
| Chrome | no status bar / home indicator | full framebuffer incl. status bar, notch, home indicator | crop simulator content rect via known safe-area insets for `--device` |
| Scale | logical px × `deviceScaleFactor` | physical px (e.g. @3x) | resample **both** to a common logical raster (device logical pt × fixed scale) with an **identical filter** (Lanczos3 both sides) |
| Color | sRGB-tagged PNG | Display-P3 framebuffer | convert P3 → sRGB (relative colorimetric) before any ΔE |
| Coords | DOM bbox in CSS px @ logical viewport | view frame in screen pt | apply `transform` (scale + safe-area offset) DOM-bbox → screen-rect |
| Text raster | Skia glyphs | CoreText glyphs | irreducible — handled in Stage 5 by judging text regions on layout-box IoU + resolved token-color ΔE, NOT glyph-raster SSIM |

## Calibration procedure

Inputs: `assets/calibration/` ships a **hand-built known-correct SwiftUI
screen** + its **H5 twin** (must include both a text block and a non-text
color/shape block).

1. Render H5 twin via `capture-reference.mjs` settings; render the SwiftUI
   twin via `sim-screenshot.sh` for `--device`.
2. Apply the normalization pipeline above → two co-registered logical
   rasters + the `transform`.
3. Run `pixel-diff.mjs` on the *known-correct* pair. The result is the
   **best achievable** cross-renderer agreement for this exact toolchain:
   - `floor.ssim_nontext` — SSIM over non-text regions (expect ≥ ~0.98)
   - `floor.deltaE_p95` — 95th-pct CIEDE2000 over color regions
   - `floor.text_iou` — layout-box IoU achievable for text regions
   - `floor.ssim_global` — whole-screen SSIM of a *correct* screen (this is
     the realistic ceiling, typically **< 0.995**, often ~0.97–0.99 with text)
4. Sanity bound: if the known-correct pair cannot beat conservative bounds
   (`ssim_nontext ≥ 0.95`, `text_iou ≥ 0.9`), the toolchain is **not
   measurable** → write `blocked.json` and STOP. Never grade real screens
   against an unproven metric.
5. **Flat-content guard**: SSIM is insensitive to a uniform mean shift on
   near-zero-variance (effectively flat) images — a clearly-divergent solid
   pair can still score ~0.95. If BOTH normalized images are effectively flat
   (luma variance below the flat threshold on each side), the floor is
   unreliable → `blocked.json` + STOP, never a falsely-high floor. This is
   why the bundled calibration content is **textured** (text + a multi-color
   stripe region), not flat solid blocks — see
   `../assets/calibration/README.md`.

## `calibration.json` schema (consumed by Stage 5)

```json
{
  "schema": "h5-to-swiftui/calibration@1",
  "pinned": {
    "sim_runtime": "iOS 17.5 (21F79)",
    "device": "iPhone 15 Pro",
    "logical_size": [393, 852],
    "render_scale": 3,
    "browser": "chromium-1180",
    "model_id": "glm-5.2",
    "temperature": 0
  },
  "transform": {
    "dom_to_screen_scale": 1.0,
    "safe_area_offset_pt": [0, 59],
    "content_rect_pt": [0, 59, 393, 759],
    "resample_filter": "lanczos3",
    "color": "p3->srgb-relative"
  },
  "twin_hashes": {
    "ref_png": "/abs/path/twin-ref.png",
    "ref_sha256": "…64-hex…",
    "gen_png": "/abs/path/twin-gen.png",
    "gen_sha256": "…64-hex…"
  },
  "calibration_source": {
    "h5_twin_dir": "assets/calibration/h5-twin",
    "swiftui_twin_dir": "assets/calibration/swiftui-twin",
    "h5_twin_source_sha256": "…64-hex…",
    "swiftui_twin_source_sha256": "…64-hex…",
    "source_tree_hash_algo": "sha256/sorted-relpath+filebytes/v1"
  },
  "floor": {
    "ssim_global": 0.982,
    "ssim_nontext": 0.991,
    "deltaE_p95": 1.6,
    "text_iou": null,
    "luma_variance": { "ref": 612.4, "gen": 588.1, "flat_threshold": 9 }
  },
  "gate": {
    "converged": {
      "ssim_nontext_min": 0.986,
      "deltaE_p95_max": 2.0,
      "text_iou_min": null,
      "require_judge_yes": true
    },
    "close": {
      "ssim_nontext_min": 0.981,
      "deltaE_p95_max": 2.4,
      "text_iou_min": null,
      "require_judge_equiv": true
    },
    "gate_explain": "human-readable only — code reads gate.converged / gate.close numerically"
  },
  "measured_at": "ISO8601"
}
```

`gate.converged` / `gate.close` are **structured numeric objects**, not a
string DSL — `scripts/evaluate-convergence.mjs` evaluates them directly
without a parser (a legacy string gate is rejected as un-enforceable). They
are derived from the measured floor: `ssim_nontext_min = floor − 0.005`,
`deltaE_p95_max = floor + 0.4`, `text_iou_min = floor − 0.03` (null ⇒ the
text-IoU sub-gate is skipped for that calibration); `close` is the 2× band.
`gate_explain` is a human-only convenience string and is **never** evaluated
by code. The numbers in `floor` are **measured per run**, not shipped
constants — different Xcode/sim versions yield different floors, which is
exactly why this stage exists. `floor.luma_variance` records each side's
structure (a both-flat pair is blocked, never floored).

### Provenance binding (enforced, not advisory)

`scripts/evaluate-convergence.mjs` **mechanically binds** the floor it grades
against — these are code-enforced fail-closed checks, not prose:

1. **schema** — `calibration.json.schema` MUST be
   `h5-to-swiftui/calibration@1`, else the grader exits 1 (it refuses to
   grade against an unrecognized contract).
2. **gate ⇐ floor** — the grader **recomputes** the expected structured gate
   from `floor` with the published tolerances (converged
   `ssim_nontext_min = floor − 0.005`, `deltaE_p95_max = floor + 0.4`,
   `text_iou_min = floor − 0.03` when non-null; `close` = 2× band) and
   rejects any `gate` that deviates beyond a 1e-4 rounding epsilon
   (`gate-floor-mismatch`, exit 1). This binds the **gate to the floor**: a
   hand-loosened `gate` (tight-looking `floor` + loose `gate`) is rejected
   unless the `floor` itself is loosened. It does **not** bind the floor's
   *value* — that is checks 3 and 4.
3. **twin source identity ⇐ shipped twins** — `calibration_source` carries a
   **deterministic SHA-256 source-tree hash** of the bundled
   `assets/calibration/h5-twin` and `assets/calibration/swiftui-twin`
   **source files (excluding build output/dotfiles)**. The grader
   **recomputes those hashes from the actual shipped assets** (resolved
   relative to the skill root, not the cwd) and fails closed
   (`calibration-twin-mismatch`, exit 1) on any mismatch. This binds the
   **identity of the bundled twin source files**. It does **not** re-measure
   or bind the `floor` *value*: an attacker can keep the real, public,
   unmodified bundled-twin source hashes here and still write a loose
   `floor`. (The *rendered* PNGs are runtime-produced and not byte-stable
   across machines, so the SOURCE tree — fixed and shippable — is what is
   bound. `twin_hashes` is non-security provenance metadata of the exact PNGs
   the floor was measured on; the *enforced* binding is the source-tree hash
   of the source files.)
4. **floor value ⇐ calibrate-render's own sanity envelope** — the grader
   asserts `floor` satisfies the SAME sanity bound `calibrate-render.mjs`
   enforces before it is willing to emit `calibration.json` at all
   (`ssim_nontext ≥ 0.95`, non-null `text_iou ≥ 0.9`, metric-valid
   `deltaE_p95`), via the shared `scripts/_calib-consts.mjs` (single source
   of truth, imported by both producer and consumer). A `floor` that fails
   this envelope could not have been produced by an honest
   `calibrate-render.mjs` run (it writes `blocked.json`, not
   `calibration.json`) ⇒ `floor-implausible`, exit 1. This **kills the
   absurd-floor attack** (e.g. `ssim_nontext:0.05, deltaE_p95:200` with the
   real public twin hashes copied in). It does **not** re-measure the floor:
   a `floor` *within* this envelope yet looser than the TRUE measured floor
   is still trusted — the grader cannot re-render the bundled twins to
   re-derive the real number.

**Named irreducible residuals (honest, per §1.1) — BOTH stated, neither
hidden:**

1. **The grader cannot re-execute the simulator renders.** It trusts the
   per-iteration `pixel-diff.mjs` JSONs were produced by running the real
   `pixel-diff.mjs` on real `sim-screenshot.sh` renders (bounded by that
   script's no-fake build/env spine — no simulator / no build ⇒
   `blocked`/`needs-human`, never converged).
2. **The grader cannot re-measure the calibration floor.** Check 4 asserts
   the supplied `floor` is within calibrate-render's own sanity envelope and
   the gate is recomputed from it, but a `floor` *within* that envelope yet
   looser than the true measured floor is trusted (the grader cannot
   re-render the bundled twins to re-derive the real number). Mitigated by:
   the orchestrator's contractual obligation to run the real,
   sanity/flat-image-spined `calibrate-render.mjs`, and the human-readable
   `calibration_provenance` recorded in the convergence artifact.

Both residuals are irreducible without the grader itself re-rendering; they
are stated, not hidden.

## Reproducibility rule

Re-running calibration on the same pinned toolchain must produce `floor`
values within ±0.005 SSIM / ±0.3 ΔE. Larger drift ⇒ environment is unstable;
record it and degrade the run's claims (Stage 5 verdicts become advisory).
