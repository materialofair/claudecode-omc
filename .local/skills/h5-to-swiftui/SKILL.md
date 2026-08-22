---
name: h5-to-swiftui
version: 1.0.0
description: >-
  Convert an H5 / web app's source into a native SwiftUI iOS app by native
  rewrite (NOT a WebView shell, NOT a transpiler). Use when the user wants to
  port, re-implement, or migrate a web/H5 frontend to native SwiftUI with
  high visual fidelity, asks to "turn this web app into a real iOS app", or
  wants a measured render-diff convergence loop against a browser baseline.
  Auto-detects the web stack (v1: vanilla + React; other stacks are detected
  then gated, not guessed), extracts design tokens, calibrates a
  cross-renderer fidelity floor, rewrites per component, and drives a bounded
  render→diff→correct loop that reports a quantified visual residual plus an
  independent judge verdict. It does NOT promise literal pixel-identity:
  cross-renderer differences impose a measured floor it reports honestly.
  Triages canvas/WebGL/complex-animation/3rd-party-SDK/backend surfaces
  instead of silently emitting wrong code.
argument-hint: "<path-to-h5-source> [--ios-floor 17] [--device 'iPhone 15 Pro'] [--max-iter 3]"
disable-model-invocation: false
user-invocable: true
allowed-tools:
  - read
  - grep
  - glob
  - bash
  - edit
  - task
model: glm-5.2
---

# H5 → Native SwiftUI (perceptually-convergent, residual-quantified)

Convert a web/H5 app to a **native SwiftUI** iOS app by reading the source and
**re-implementing** UI + logic in idiomatic SwiftUI. This is a native rewrite,
**not** a WebView wrapper and **not** a mechanical transpiler — those cannot
reach native fidelity (see `references/stack-detection.md` for why).

## Honest promise (read this first)

Literal pixel-identity is **physically unreachable** for any text-bearing
screen: H5 renders in WebKit/Skia, SwiftUI in CoreText/Core Animation;
per-glyph subpixel/hinting and sRGB-vs-Display-P3 differences impose a
**non-zero residual** even when the SwiftUI is perfectly correct. This skill
therefore does **not** claim "pixel-perfect". It:

1. **measures** the achievable cross-renderer floor for the current toolchain
   (Stage 2.5 calibration),
2. drives a render→diff→correct loop that **strictly reduces** visual delta
   toward that measured floor,
3. stops with a **quantified residual**, an **independent adversarial judge**
   verdict, and a tiered outcome: `converged` / `close` / `needs-human`,
4. **triages** anything it cannot safely convert — never silently emits
   plausible-wrong code.

Never describe output as "pixel-accurate/perfect" in any report.

## When to use / not use

Use for: porting a web/H5 frontend to native SwiftUI; "make this a real iOS
app (not a webview)"; measured visual migration. Not for: building a webview
wrapper (decline — out of scope); generic SwiftUI feature work (use normal
dev flow); design-mock→code with no source app (different problem).

## Inputs

- `<path-to-h5-source>` (required)
- `--ios-floor` (default `17`; changes API availability + risk tiers)
- `--device` (default `iPhone 15 Pro`; sets logical viewport + safe-area)
- `--max-iter` (default `3`; Stage 5 per-component iteration cap)
- `--thresholds` (optional override; default = **calibrated**, not asserted)

## Environment reality (hard gate)

Stage 5 needs macOS + Xcode + iOS Simulator. If absent OR the generated
project fails to build, the affected component is `needs-human`/`blocked`
and is **never counted converged**. The skill must not fabricate
convergence. Stages 0–4 + triage still run and produce value.

## Pipeline (Stage 0–7) — product contracts

All stage products go under the *target project*'s `.h5-to-swiftui/` work
dir (inspectable, resumable). Every convergence artifact header pins
`sim_runtime`, `browser_version`, `model_id`, `temperature:0` — re-runs must
reproduce the same **verdict** (not the same pixels).

| Stage | Does | Key output |
|---|---|---|
| 0 Intake + detect + **v1 gate** | `scripts/detect-stack.mjs`; framework ∉ {vanilla,React} ⇒ write report & **STOP** (no guess) | `stack-report.json` |
| 1 Static analysis + facts + risk | inventory; `scripts/extract-tokens.mjs` (static∪runtime DTCG); risk triage pass *before* any generation; token-miss ⇒ `token-gaps.json` (never inline) | `pages/components/state-model/api/tokens/token-gaps/risk-triage.json` |
| 2 Reference capture | `scripts/capture-reference.mjs` (Playwright, iOS viewport, animations frozen, webfont/async settle, masks, browser pinned) | `reference/**`, `reference/manifest.json` |
| 2.5 **Render-equivalence calibration** | `scripts/calibrate-render.mjs` on bundled known-correct pair → normalization + **measured floor**; unmeasurable ⇒ `blocked.json` | `calibration.json` → see `references/render-equivalence-calibration.md` |
| 3 Scaffold | Xcode skeleton; `DesignTokens` (DTCG→Color/Font/spacing/radius + `.colorset` dark); router→`NavigationStack`; state skeleton | compiling skeleton |
| 4 Per-component rewrite | LLM rewrites each component using **only** token vocab + `references/css-to-swiftui-map.md`; **each component MUST emit a snapshot host** (isolated render entry); idiomatic-lint rejects `.position/.offset`-pinned layouts; Tier-3 ⇒ non-compiling `fatalError` stub | per-component `.swift` + host |
| 5 **Convergence loop** ★ | per component: host-render→normalize(calibration)→cascade diff (`pixel-diff.mjs`)→feedback payload→structured patch→recompile→re-measure; cap `--max-iter`. **The verdict is emitted ONLY by `scripts/evaluate-convergence.mjs`** — it mechanically enforces every anti-gaming guard and exits non-zero on any violation; the LLM never hand-writes `convergence/<component>.json` | `convergence/<component>.json` (written by `evaluate-convergence.mjs`) → see `references/visual-diff-loop-protocol.md` |
| 6 Behavioral parity | port `URLSession` async / Keychain tokens / ATS-flag `http://` / state / models; equivalence checks | `parity-report.json` |
| 7 Assemble + honest report | build; aggregate; summary leads with `needs-human` if it dominates | Xcode project + `conversion-report.json` + `convergence-summary.json` |

## Hard rules (non-negotiable)

- **No silent failure.** Tier-3 surfaces (WebGL/WebGPU, RAF physics, WebRTC,
  payments/secrets, analytics/ATT) ⇒ non-compiling `fatalError` stub +
  machine-readable entry in `conversion-report.json`. See
  `references/high-risk-triage.md`.
- **Anti-gaming (Stage 5) — ENFORCED IN CODE by
  `scripts/evaluate-convergence.mjs`** (the sole thing that may emit the
  verdict; it exits non-zero on any violation so a pipeline cannot ignore a
  failed gate): the calibration gate is **recomputed from `calib.floor`** and
  a hand-loosened gate is rejected (`gate-floor-mismatch`, exit 1 — this binds
  the *gate to the floor*, not the floor's value); the **identity of the
  bundled twin source files** (excluding build output/dotfiles) is bound via
  `calibration_source` source-tree hashes recomputed from
  `assets/calibration/{h5-twin,swiftui-twin}` (`calibration-twin-mismatch`,
  exit 1 — binds the twin *source identity*, not the measured floor value);
  the `floor` *value* is asserted to satisfy `calibrate-render.mjs`'s own
  sanity envelope via the shared `scripts/_calib-consts.mjs`
  (`floor-implausible`, exit 1 — a floor calibrate-render could not have
  emitted is rejected, killing the absurd-floor attack; a floor *within* that
  envelope but looser than the true measured one is a disclosed residual, see
  below); the judge **negative control is bound** to the shipped, hash-pinned
  `assets/calibration/swiftui-twin-divergent` source files (structured
  `{stimulus_source_hash,rejected,differences}` under **forced-difference-3**;
  the legacy bare string is rejected and an unbound control VOIDs any `YES`);
  mask budget ≤10% with a non-empty reason per mask; the structured gate is
  evaluated per iteration (a text-region `iou` of `null` is a FAIL; pHash is
  necessary-not-sufficient and never short-circuits); best-of-N retains
  **only built + gate-passing iterations** chosen by the script
  (monotone-or-fail; caller's pick ignored); a present `blocked.json` or no
  built+passing iteration ⇒ never converged. **Named irreducible residuals
  (honest, §1.1) — BOTH disclosed:** (1) the grader cannot re-run the
  simulator, so it trusts the per-iteration `pixel-diff.mjs` JSONs were
  produced by the real `pixel-diff.mjs` on real `sim-screenshot.sh` renders
  (bounded by that script's no-fake spine); (2) the grader cannot re-measure
  the calibration floor — it asserts the supplied `floor` is within
  `calibrate-render.mjs`'s own sanity envelope and recomputes the gate from
  it, but a floor *within* that envelope yet looser than the true measured
  floor is trusted, mitigated by the orchestrator's obligation to run the
  real, sanity-spined `calibrate-render.mjs` and the recorded
  `calibration_provenance`. Maximally provenance-bound, not zero-trust. The
  **whole-assembled-screen SSIM-trend check is NOT an automated Stage-5
  guard** — see the known limitation below; it is a documented **Stage-7
  manual** cross-check.
- **Calibrated, not asserted.** Stage 5 gates against the **measured** floor
  from `calibration.json`, never a hardcoded SSIM constant.
- **v1 scope.** Mapping authored for vanilla + React only; other detected
  stacks stop at Stage 0 with an explicit report.
- **Compile-failure branch.** Non-building patch ⇒ revert to best
  gate-passing iteration, consume an iteration; terminal ⇒ `needs-human`.

## References (read on demand — progressive disclosure)

- `references/stack-detection.md` — detection heuristics, why rewrite > webview/transpile, v1 gate
- `references/design-token-extraction.md` — static∪runtime DTCG pipeline, token-gap rule
- `references/css-to-swiftui-map.md` — flex/grid/positioning/box-model tables, custom-`Layout` triggers
- `references/render-equivalence-calibration.md` — Stage 2.5 normalization + floor measurement + `calibration.json` schema
- `references/visual-diff-loop-protocol.md` — Stage 5 mechanism, payload + artifact schemas, tiered verdict, anti-gaming
- `references/high-risk-triage.md` — Tier 1/2/3 catalog, stub format, `conversion-report.json` schema

## Scripts

`detect-stack.mjs` `extract-tokens.mjs` `capture-reference.mjs`
`calibrate-render.mjs` `pixel-diff.mjs` `mark-overlay.mjs`
`evaluate-convergence.mjs` `sim-screenshot.sh` — each supports `--help`;
capability/build probes degrade to an explicit block, never a fake success.

`scripts/evaluate-convergence.mjs` is the **sole executable convergence
authority**: it consumes the per-iteration `pixel-diff.mjs` JSON, the
structured `calibration.json` gate, the masks, and the judge result, then
mechanically decides the tier and **exits non-zero** (3 = needs-human/guard
violation, 4 = blocked) so the verdict cannot be faked or ignored. The
orchestrator MUST call it and MUST NOT hand-write `convergence/<component>.json`.

### Known limitation (honest)

The **whole-assembled-screen SSIM-trend check** described in `spec.md` is
**not** an automated Stage-5 guard — there is no executable component that
diffs the assembled screen during the loop, so advertising it as active
would be a prose-only claim. It is instead a **Stage-7 manual cross-check**:
after assembly, a human (or a separate verification pass) compares the
assembled-screen capture against the reference so per-component `converged`
results cannot mask a broken composition. Treat per-component verdicts as
authoritative only at component granularity until that Stage-7 check is done.

## Assets

`assets/calibration/` — known-correct SwiftUI screen (`swiftui-twin/`) + H5
twin (`h5-twin/`) for Stage 2.5, plus a deliberately-wrong
`swiftui-twin-divergent/` used as the Stage-5 judge **negative control**.
Calibration content is **textured** (text + a 4-stripe multi-color region),
never flat solids, so SSIM is meaningful (`calibrate-render.mjs` blocks a
flat pair). `assets/sample-h5-vanilla/` + `assets/sample-h5-react/` are the
dry-run fixtures (the React one is the text-heavy / custom-`Layout` / Tier-3
hard path).

## Done = evidence

A run is complete only with: `stack-report.json`, `calibration.json` (finite
floor), per-component `convergence/*.json` (pinned-version header, iteration
history, masks, negative-control result, tiered verdict),
`conversion-report.json`, and an honest `convergence-summary.json`. No
success claim without these.
