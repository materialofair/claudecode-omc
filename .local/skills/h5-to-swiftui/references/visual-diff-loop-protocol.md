# Stage 5 — Visual-Diff Convergence Loop Protocol

The core mechanism. Operates **per component** (component granularity is the
primary anti-oscillation defense — a fix to one component cannot break
another). Consumes `calibration.json` (Stage 2.5) and the per-component
**snapshot host** (Stage 4 hard output contract).

## One iteration

1. **Render** the component via its snapshot host in the simulator
   (`sim-screenshot.sh`). Normalize per `calibration.json.transform`
   (crop → resample → P3→sRGB) so it co-registers with the Stage-2
   reference crop for that component (`reference/<screen>/<component>.png`).
2. **Diff cascade** (`pixel-diff.mjs`):
   - pHash Hamming is recorded as raw data plus a `phash_fast_candidate`
     boolean (≤ 5). **It is necessary-not-sufficient and NEVER a
     short-circuit to `converged`** — `pixel-diff.mjs` does not decide the
     verdict; `evaluate-convergence.mjs` does, and it always requires the
     region gate to pass regardless of pHash.
   - split component into **text regions** vs **non-text regions** using the
     DOM bbox map:
     - text → score by layout-box **IoU** + resolved **token-color ΔE**
       (foreground/background), **never glyph-raster SSIM** (cross-renderer
       glyph rasters are not comparable — Stage 2.5). IoU is the **real**
       `bboxIoU(refBox, genBox)` only when `--gen-bbox-map` supplies the
       generated bbox; otherwise `iou` is **`null`** (never a fabricated
       1.0), and a `null` iou counts as a gate **FAIL**.
     - non-text → SSIM + CIEDE2000 + AA-tolerant diff mask.
   - **inter-component spacing delta** is `null` unless generated positions
     are supplied via `--gen-bbox-map` (never fabricated `{top:0,leading:0}`).
   - Inputs MUST be **co-registered** (same dimensions) — `pixel-diff.mjs`
     does not normalize and **hard-errors (exit 1)** on a size mismatch;
     pre-normalize via Stage 2.5 `calibration.transform` first.
3. **Feedback payload** to the corrector LLM:
   - reference + generated, both with **identical Set-of-Mark** numbered
     overlays (`mark-overlay.mjs`),
   - red diff-mask overlay on the reference,
   - structured JSON delta (schema below),
   - **two-stage critique**: (a) visual/perceptual NL critique, then (b)
     code-level NL→SwiftUI-patch recommendation (separation of modalities).
4. **Patch**: corrector emits a **structured per-file diff** (NOT a
   whole-file rewrite — enables reversion control), constrained to the
   `tokens.json` vocabulary; prior-iteration correction history is injected
   ("you changed X which worsened Y; do not revert").
5. **Recompile.** Compile-failure branch: revert working tree to the best
   gate-passing iteration, **consume one iteration**; if the cap is hit with
   no buildable+passing iteration ⇒ `needs-human` (never `converged`).
6. **Re-measure** (step 2). Retain best **only among gate-passing
   iterations** (monotone-or-fail: a non-passing run is never presented as a
   result).

Cap = `--max-iter` (default 3). Diminishing returns past 3 are documented in
`../../../.omc/conductor/tracks/h5-to-swiftui/research/findings.md` RQ4.

## The verdict is emitted ONLY by `scripts/evaluate-convergence.mjs`

`convergence/<component>.json` is **never hand-written** by the orchestrator.
The orchestrator runs `pixel-diff.mjs` per iteration, records each
iteration's `built` flag, gathers masks + the independent-judge result, then
calls `scripts/evaluate-convergence.mjs`, which **mechanically** decides the
tier and **exits non-zero on any guard violation** (exit 3 =
needs-human/guard violation, exit 4 = blocked, exit 0 = converged/close) so a
pipeline cannot ignore a failed gate. Every guard below is enforced *in that
script's code*, not by prose. The script — not the caller — chooses
`best_iteration` and computes `gate_passed` per iteration; caller-supplied
values for those are ignored.

Invocation:

```
node scripts/evaluate-convergence.mjs \
  --iterations iterations.json \      # [{i,diff_json_path,built}, ...]
  --calibration calibration.json \    # STRUCTURED numeric gate (not string DSL)
  --judge judge.json \                # {negative_control,framing,differences,verdict}
  --masks masks.json \                # [{x,y,w,h,reason}] (reason required)
  --component-area 320x140 \          # mask-fraction denominator
  --component ProductCard \
  --out .h5-to-swiftui/convergence/ProductCard.json
```

## Trust model & residual (honest disclosure — spec §1.1)

The skill's own thesis (§1.1) is *report the residual, do not pretend it is
zero*. Applied to the grader's **own** trust model:

**Mechanically bound (fail-closed, in `evaluate-convergence.mjs` code):**

- the structured `gate` is **recomputed from `calib.floor`** and a deviating
  gate is rejected (`gate-floor-mismatch`, exit 1) — this binds the *gate to
  the floor* (a hand-loosened gate is rejected unless the floor is loosened);
  it does not bind the floor's *value*;
- the **identity of the bundled twin source files** (excluding build
  output/dotfiles) is bound via `calibration_source` source-tree hashes
  recomputed from the actual `assets/calibration/{h5-twin,swiftui-twin}`
  (`calibration-twin-mismatch`, exit 1) — this binds the twin *source
  identity*, NOT the measured `floor` *value* (the real public twin hashes
  can be copied alongside a loose floor);
- the **`floor` value** is asserted to satisfy `calibrate-render.mjs`'s OWN
  sanity envelope via the shared `scripts/_calib-consts.mjs`
  (`ssim_nontext ≥ 0.95`, non-null `text_iou ≥ 0.9`, metric-valid
  `deltaE_p95`); a floor calibrate-render could not have emitted (it writes
  `blocked.json` below this) is rejected `floor-implausible`, exit 1 — this
  kills the absurd-floor attack but does NOT re-measure the floor;
- the judge negative control is bound to the **shipped, hash-pinned**
  `assets/calibration/swiftui-twin-divergent` source files (structured +
  rejected + framed; `negative-control-unbound` VOIDs any `YES`, exit 3);
- pHash never short-circuits; a `null` text IoU is a FAIL; best-of-N is
  monotone-or-fail; the mask budget is verified or the run refuses to pass;
  `calibration.json.schema` is asserted.

**Named, irreducible residuals (NOT zero — BOTH stated, neither hidden):** a
fully zero-trust verdict is impossible because *something must run the
renders and something must measure the floor*.

1. **The grader cannot re-execute the simulator renders.** It trusts the
   per-iteration `pixel-diff.mjs` JSONs were produced by running the **real
   `pixel-diff.mjs` on real `sim-screenshot.sh` renders** (bounded by
   `sim-screenshot.sh`'s no-fake build/env spine — no simulator / no build ⇒
   `blocked`/`needs-human`, never converged).
2. **The grader cannot re-measure the calibration floor.** It asserts the
   supplied `floor` satisfies `calibrate-render.mjs`'s own sanity envelope
   and recomputes the gate from it, but a `floor` *within* that envelope yet
   looser than the TRUE measured floor is trusted (it cannot re-render the
   bundled twins to re-derive the real number). Mitigated by the
   orchestrator's contractual obligation to run the real,
   sanity/flat-image-spined `calibrate-render.mjs` and by the human-readable
   `calibration_provenance` recorded in the convergence artifact.

These are the deliberate, documented boundaries: the deliverable is
**"maximally provenance-bound + honestly disclosed residual"**, explicitly
*not* "zero-trust". The **whole-assembled-screen trend check remains a
Stage-7 manual cross-check**, not an automated Stage-5 guard (unchanged;
still honestly scoped).

## Tiered verdict (honest)

`evaluate-convergence.mjs` reads the **structured** `calibration.json.gate`
(numeric `gate.converged` / `gate.close` objects — a legacy string-DSL gate
is rejected as un-enforceable) and evaluates it against each iteration's
`pixel-diff.mjs` output:

- **`converged`** — the *script's* chosen best iteration (built AND
  gate-passing) passes the converged gate vs the *measured* floor AND the
  independent judge `YES` with a valid negative control.
- **`close`** — structural metrics within the `close` band AND judge returns
  `visually-equivalent-residual-subperceptual`. This is an **honest accept**,
  explicitly distinct from faking — "as good as this renderer pair allows".
- **`needs-human`** — anything else; recorded with full evidence + the
  machine-readable guard reason. **`blocked`** — a `blocked.json` is present
  for the component (never converged).

## Independent judge (anti-collusion)

- Separate sub-agent, separate lane (OMC: never self-approve in same
  context). Dispatch via `Agent` (use `verifier` or `qa-tester`), NOT the
  corrector.
- **Negative control (BOUND to the shipped divergent twin)**: before its
  verdict is trusted, feed the judge the known-divergent pair
  `h5-twin` vs the bundled `assets/calibration/swiftui-twin-divergent`; it
  MUST return a rejection. This is **not** a free `"passed"` string — the old
  bare form is rejected as unbound (it asserts a judge run nothing verified).
  `judge.negative_control` MUST be the structured artifact below, and
  `scripts/evaluate-convergence.mjs` recomputes the divergent twin's
  source-tree hash from the shipped asset and fails closed
  (`negative-control-unbound`, any `YES` VOID, exit 3) unless every field
  matches:

  ```json
  "negative_control": {
    "stimulus_source_hash": "<sha256 source-tree hash of the bundled assets/calibration/swiftui-twin-divergent>",
    "divergent_pair": "h5-twin vs swiftui-twin-divergent",
    "rejected": true,
    "differences": [ { "desc": "green bg vs light", "severity": "major" }, … ]
  }
  ```

  `stimulus_source_hash` ≠ the recomputed bundled divergent hash, OR
  `rejected !== true`, OR an empty/unstructured `differences`, OR
  `framing !== "forced-difference-3"` ⇒ the negative control is **unbound**,
  any `YES` is **VOID**, tier forced `needs-human`, exit non-zero
  (`reason: negative-control-unbound`). This ties "the judge really rejected
  the *known-divergent* pair" to the shipped, hash-pinned asset rather than a
  free string.
- **Adversarial framing**: prompt = *"enumerate the 3 most significant
  visual differences between A and B and rate each severity"*, never
  "do these match?". A `converged` verdict requires all 3 to be
  sub-perceptual / cross-renderer-irreducible. `judge.framing` MUST be
  `"forced-difference-3"` (enforced; absence/mismatch VOIDs `YES`).

## Anti-gaming guards

**Enforced in code by `scripts/evaluate-convergence.mjs`** (violation ⇒ tier
downgrade + non-zero exit + a machine-readable reason — never a silent pass):

- **Mask budget**: `sum(mask area) / component area` must be ≤ 0.10; every
  mask must carry a non-empty `reason`. Over budget or a reason-less mask ⇒
  forced `needs-human`, exit 3. If masks are supplied but the component area
  is unknown, the script **refuses to proceed (exit 1)** rather than silently
  pass an unverifiable budget.
- **Gate eval in code**: the structured `calibration.json` thresholds are
  evaluated per iteration to produce `gate_passed` (the caller cannot supply
  it). A text-region `iou` of `null` is a **FAIL**. pHash never short-circuits.
- **Monotone-or-fail best-of-N**: `best_iteration` is the script's choice
  among iterations that are **both** `built==true` **and** `gate_passed==true`;
  if none qualify ⇒ `needs-human` (recorded). The caller's `best_iteration`
  is ignored.
- **Negative-control voids judge (bound to the shipped divergent twin)**:
  `judge.negative_control` MUST be the structured object
  `{stimulus_source_hash, divergent_pair, rejected, differences}` whose
  `stimulus_source_hash` equals the **source-tree hash of the shipped
  `assets/calibration/swiftui-twin-divergent`** recomputed by the grader,
  with `rejected === true`, a non-empty structured `differences`, and
  `judge.framing === "forced-difference-3"`. The legacy bare
  `negative_control:"passed"` string is **rejected as unbound**. Any
  deviation ⇒ any `verdict:"YES"` is **VOID** ⇒ cannot be `converged`
  (downgraded to `needs-human`, recorded `negative_control: failed`,
  `reason: negative-control-unbound`, exit 3).
- **Calibration provenance (gate ⇐ floor; twin source identity; floor ⇐
  sanity envelope)**: the grader asserts
  `calibration.json.schema == "h5-to-swiftui/calibration@1"`; **recomputes**
  the structured gate from `floor` and rejects a deviating `gate`
  (`gate-floor-mismatch`, exit 1 — binds the gate TO the floor); recomputes
  the bundled `h5-twin`/`swiftui-twin` **source-file** tree hashes from the
  shipped assets and rejects a mismatching `calibration_source`
  (`calibration-twin-mismatch`, exit 1 — binds the twin source IDENTITY, not
  the floor value); and asserts the `floor` *value* satisfies
  `calibrate-render.mjs`'s own sanity envelope via the shared
  `scripts/_calib-consts.mjs` (`floor-implausible`, exit 1 — a floor
  calibrate-render could not have emitted is rejected, killing the
  absurd-floor attack). **Residual:** a `floor` *within* that envelope yet
  looser than the true measured floor is trusted — the grader cannot
  re-render the bundled twins to re-measure it (named residual (2) under
  "Trust model & residual").
- **Build accounting**: a present `blocked.json` for the component, or no
  built+gate-passing iteration ⇒ `blocked`/`needs-human`, **never**
  `converged`.

**Enforced elsewhere / by process (NOT by `evaluate-convergence.mjs`):**

- **Idiomatic lint** (Stage 4): a component whose layout is predominantly
  `.position()`/`.offset()` absolute pinning is rejected at rewrite time —
  pixel-pushed WebView-in-SwiftUI, not a native rewrite.
- **Whole-assembled-screen trend check — Stage-7 manual cross-check, NOT an
  automated Stage-5 guard.** No executable component diffs the assembled
  screen during the loop, so it is **not** advertised as active automation.
  After assembly (Stage 7) a human / separate verification pass compares the
  assembled-screen capture vs the reference so per-component `converged`
  cannot mask a broken composition. This is a documented **known
  limitation**: until that Stage-7 check runs, per-component verdicts are
  authoritative only at component granularity.
- **Determinism**: artifact header pins sim/browser/model/seed (passed
  through from `calibration.json`); the dry-run runs twice and must yield the
  **same verdict** (not same pixels).

## `pixel-diff.mjs` output schema (`h5-to-swiftui/diff@1`)

`phash_hamming` is raw data; `phash_fast_candidate` is necessary-not-
sufficient (NOT a converged signal — there is **no** `phash_converged`
field). `iou` is `null` unless `--gen-bbox-map` supplied the generated bbox
(a `null` iou is a gate FAIL, never an assumed 1.0).
`inter_component_spacing_delta_pt` is `null` (with an explanatory
`inter_component_spacing_delta_note`) when generated positions are unknown —
never fabricated zeros.

```json
{
  "schema": "h5-to-swiftui/diff@1",
  "component": "ProductCard",
  "phash_hamming": 7,
  "phash_fast_candidate": false,
  "regions": {
    "text":     [{"mark": 2, "iou": 0.95, "fg_deltaE": 1.2, "bg_deltaE": 0.6}],
    "nontext":  [{"mark": 1, "ssim": 0.991, "deltaE_p95": 1.4}]
  },
  "inter_component_spacing_delta_pt": null,
  "inter_component_spacing_delta_note": "null: generated component positions unknown (--gen-bbox-map absent); reporting null, NOT zeros",
  "diff_mask_png": ".h5-to-swiftui/diff/ProductCard.iter2.mask.png",
  "global_ssim": 0.984,
  "diff_pixel_fraction": 0.0142
}
```

When no generated bbox is supplied, a text region is instead:
`{"mark": 2, "iou": null, "iou_note": "no generated bbox supplied (--gen-bbox-map absent or no match) — IoU is null, NOT assumed 1.0", "fg_deltaE": 1.2, "bg_deltaE": 0.6}`.

## `convergence/<component>.json` schema (`h5-to-swiftui/convergence@1`)

Emitted **only** by `scripts/evaluate-convergence.mjs` (pinned-version header
passed through from `calibration.json`):

```json
{
  "schema": "h5-to-swiftui/convergence@1",
  "component": "ProductCard",
  "pinned": { "sim_runtime": "...", "browser": "...", "model_id": "...", "temperature": 0 },
  "calibration_floor": { "ssim_nontext": 0.991, "deltaE_p95": 1.6, "text_iou": 0.94 },
  "gate": {
    "converged": {"ssim_nontext_min": 0.986, "deltaE_p95_max": 2.0, "text_iou_min": 0.91, "require_judge_yes": true},
    "close":     {"ssim_nontext_min": 0.981, "deltaE_p95_max": 2.4, "text_iou_min": 0.88, "require_judge_equiv": true}
  },
  "iterations": [
    {"i": 1, "diff": {"global_ssim": 0.90, "phash_hamming": 20, "diff_pixel_fraction": 0.2},
      "built": true,  "gate_passed": false, "close_band_passed": false,
      "phash_fast_candidate": false, "gate_detail": "nontext mark 1 ssim 0.9 < 0.986"},
    {"i": 2, "diff": {"global_ssim": 0.993, "phash_hamming": 3, "diff_pixel_fraction": 0.02},
      "built": true,  "gate_passed": true,  "close_band_passed": true,
      "phash_fast_candidate": true,  "gate_detail": "all sub-gates passed"},
    {"i": 3, "diff": {"global_ssim": 0.999, "phash_hamming": 2, "diff_pixel_fraction": 0.001},
      "built": false, "gate_passed": false, "close_band_passed": false,
      "phash_fast_candidate": true,  "gate_detail": "all sub-gates passed"}
  ],
  "masks": [{"x":0,"y":0,"w":12,"h":12,"reason":"live timestamp"}],
  "mask_fraction": 0.02,
  "mask_budget": 0.10,
  "component_area_px": 44800,
  "component_area_source": "flag 320x140",
  "judge": {
    "negative_control": "passed",
    "negative_control_binding": {
      "expected_divergent_source_sha256": "…64-hex (recomputed from shipped swiftui-twin-divergent)…",
      "claimed_stimulus_source_hash": "…64-hex (from judge.json)…",
      "rejected": true,
      "bound": true,
      "reasons": []
    },
    "framing": "forced-difference-3",
    "differences": [
      {"desc": "1px baseline shift on price label", "severity": "sub-perceptual"},
      {"desc": "shadow blur 0.5pt softer", "severity": "sub-perceptual"},
      {"desc": "—", "severity": "none"}
    ],
    "verdict": "YES",
    "verdict_honored": true
  },
  "calibration_provenance": {
    "schema_ok": true,
    "gate_recomputed_from_floor": true,
    "calibration_source": {
      "h5_twin_source_sha256": "…64-hex…",
      "swiftui_twin_source_sha256": "…64-hex…",
      "verified_against_bundled": true
    }
  },
  "guard_violations": [],
  "best_iteration": 2,
  "tier": "converged",
  "tier_reason": "gate_passed(best i=2) AND judge YES with valid negative control",
  "residual": {"ssim_nontext": 0.993, "deltaE_p95": 1.4, "text_iou": 0.96},
  "evaluated_at": "ISO8601"
}
```

`best_iteration` is the script's choice (built AND gate-passing only); a
non-empty `guard_violations` array and/or a `tier` of `needs-human`/`blocked`
corresponds to a non-zero process exit (3 / 4) so the verdict cannot be
silently ignored.

## Stop conditions

- `converged` or `close` reached ⇒ accept best gate-passing iteration.
- Cap hit, no gate-passing+buildable iteration ⇒ `needs-human`.
- Mask budget exceeded / negative control failed / idiomatic-lint failed ⇒
  `needs-human` regardless of metrics.
- No simulator or persistent build failure ⇒ `blocked` (Stage 5 skipped for
  that component; counted as `needs-human` in the summary, never success).
