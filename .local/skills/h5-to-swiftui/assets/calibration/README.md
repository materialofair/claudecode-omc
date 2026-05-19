# Stage 2.5 Calibration Pair

This directory contains a **hand-built, known-correct calibration pair** for
the `h5-to-swiftui` skill's render-equivalence calibration stage. The two
sides (`h5-twin/` and `swiftui-twin/`) render the **same intended design** on
an iPhone 15 Pro logical viewport (393×852 pt).

> **Key principle:** any measured rendering difference between these two sides
> is the **irreducible cross-renderer floor** — not a defect. The pair is
> equivalent by construction, so the floor reflects only the unavoidable
> divergence between WebKit/Skia glyph rasterization and CoreText/Metal
> rendering, color-space pipeline differences (sRGB vs Display-P3), and
> sub-pixel sampling. Never grade real conversion screens against a tighter
> bound than this measured floor.

---

## Contents

| Path | Description |
|---|---|
| `h5-twin/index.html` | Static H5 page — open directly, no build step |
| `h5-twin/style.css` | All design tokens as CSS custom properties (`--*`) |
| `swiftui-twin/Package.swift` | Swift Package manifest (Swift 5.9+, iOS 17+) |
| `swiftui-twin/Sources/CalibrationScreen/CalibrationScreen.swift` | `CalibrationScreenView` + `#Preview` — the **known-correct** SwiftUI side |
| `swiftui-twin-divergent/Package.swift` | Swift Package manifest for the negative control |
| `swiftui-twin-divergent/Sources/CalibrationScreenDivergent/CalibrationScreenDivergent.swift` | **Deliberately WRONG** SwiftUI screen — the Stage 5 judge **negative control** |
| `tokens.json` | Ground-truth DTCG-style token map — the single source of truth |
| `.gitignore` | Ignores Swift Package `.build/` (never commit build output) |
| `README.md` | This file |

### The divergent twin (negative control)

`swiftui-twin-divergent/` is **intentionally wrong** versus the H5 twin:
wrong colors (green background, blue circle, recolored stripes, inverted text
colors), shifted layout (much larger top inset, doubled section gap, circle
moved to the trailing edge, near-square taller card), and different copy.

Its role: the Stage 5 **independent judge must REJECT** the pair
(`h5-twin` vs `swiftui-twin-divergent`) under the adversarial
forced-difference-3 framing. If the judge instead calls them equivalent, the
run's `judge.negative_control` is recorded as **`failed`** and any `YES`
verdict is **VOID** for that run. This is enforced mechanically — not by
prose — in `scripts/evaluate-convergence.mjs` (guard 4).

### Textured-content requirement (NOT flat solids)

The bundled calibration content **must be textured** — text plus a
multi-color structured region. Flat solid blocks make SSIM **insensitive to a
uniform mean shift**: a clearly-divergent solid pair can still score ~0.95,
yielding a falsely-high floor. The card is therefore a **4-stripe multi-color
region** (blue/purple/teal/amber), not a single solid block, on every side
(`h5-twin`, `swiftui-twin`, `swiftui-twin-divergent`).
`scripts/calibrate-render.mjs` additionally **blocks** (writes `blocked.json`,
exits 1) if BOTH normalized images are effectively flat (near-zero luma
variance) — so a flat calibration pair can never produce a trusted floor.

---

## Design Tokens

All values are shared across both sides. `tokens.json` is the authoritative
source; `style.css` and `CalibrationScreen.swift` must match it exactly.

### Colors

| Token | Hex | CSS var | Swift `Color(red:green:blue:)` |
|---|---|---|---|
| `color.background`  | `#F2F2F7` | `--color-background`   | `r=0.9490 g=0.9490 b=0.9686` |
| `color.card`        | `#4A90D9` | `--color-card`         | `r=0.2902 g=0.5647 b=0.8510` |
| `color.circle`      | `#E8744F` | `--color-circle`       | `r=0.9098 g=0.4549 b=0.3098` |
| `color.textHeading` | `#1C1C1E` | `--color-text-heading` | `r=0.1098 g=0.1098 b=0.1176` |
| `color.textBody`    | `#636366` | `--color-text-body`    | `r=0.3882 g=0.3882 b=0.4000` |
| `color.stripeA`     | `#4A90D9` | `--color-stripe-a`     | `r=0.2902 g=0.5647 b=0.8510` |
| `color.stripeB`     | `#7E57C2` | `--color-stripe-b`     | `r=0.4941 g=0.3412 b=0.7608` |
| `color.stripeC`     | `#26A69A` | `--color-stripe-c`     | `r=0.1490 g=0.6510 b=0.6039` |
| `color.stripeD`     | `#F4B400` | `--color-stripe-d`     | `r=0.9569 g=0.7059 b=0.0000` |

The card is a **4 equal-width vertical stripe** region (A→D, left to right),
not a flat solid — see the textured-content requirement above.

### Spacing (CSS px = Swift pt at 1× logical scale)

| Token | Value | CSS var | Swift constant |
|---|---|---|---|
| `space.safeTop`     | 59 px/pt | `--space-safe-top`    | `spaceSafeTop = 59` |
| `space.pageH`       | 20 px/pt | `--space-page-h`      | `spacePageH = 20` |
| `space.sectionGap`  | 24 px/pt | `--space-section-gap` | `spaceSectionGap = 24` |
| `space.cardPadding` | 20 px/pt | `--space-card-padding`| `spaceCardPadding = 20` |
| `space.cardGap`     | 16 px/pt | `--space-card-gap`    | `spaceCardGap = 16` |

### Radii

| Token | Value | CSS var | Swift constant |
|---|---|---|---|
| `radius.card` | 16 px/pt | `--radius-card` | `radiusCard = 16` |

### Typography

| Token | Value | CSS | Swift |
|---|---|---|---|
| `font.family`            | `-apple-system` | `font-family: -apple-system, system-ui` | `.system(size:weight:)` |
| `font.sizeHeading`       | 22 px/pt | `font-size: 22px` | `.system(size: 22, weight: .semibold)` |
| `font.weightHeading`     | 600 / semibold | `font-weight: 600` | `.semibold` |
| `font.lineHeightHeading` | 1.27× | `line-height: 1.27` | `lineSpacing: 22 × 0.27 ≈ 5.9 pt` |
| `font.sizeBody`          | 15 px/pt | `font-size: 15px` | `.system(size: 15, weight: .regular)` |
| `font.weightBody`        | 400 / regular | `font-weight: 400` | `.regular` |
| `font.lineHeightBody`    | 1.47× | `line-height: 1.47` | `lineSpacing: 15 × 0.47 ≈ 7.1 pt` |

### Shape

| Token | Value | CSS var | Swift constant |
|---|---|---|---|
| `shape.circleSize` | 64 px/pt | `--size-circle` | `sizeCircle = 64` |

---

## Screen layout (both sides)

```
┌─────────────── 393 pt ───────────────┐
│                                       │
│  ← 59 pt top safe-area inset →       │
│                                       │
│  ┌─ 20pt padding ──────────────────┐ │
│  │  Calibration Screen             │ │  ← heading 22pt semibold #1C1C1E
│  │  This screen is the known-…     │ │  ← body 15pt regular #636366
│  └─────────────────────────────────┘ │
│                                       │  ← 24pt gap
│  ┌─ 20pt padding ──────────────────┐ │
│  │  ┃A┃B┃C┃D┃ 4-stripe card r=16pt │ │  ← stripes #4A90D9 #7E57C2
│  │  ┗━┻━┻━┻━┛  (textured, 40pt h)  │ │     #26A69A #F4B400
│  │  ●  ← #E8744F circle 64×64pt   │ │  ← 16pt gap below card
│  └─────────────────────────────────┘ │
│                                       │
└───────────────────────────────────────┘
  total height: 852 pt
```

---

## How to run

**H5 twin** — open `h5-twin/index.html` directly in a browser. No build step.
Set browser viewport to 393×852. (Playwright capture uses `--viewport 393x852`.)

**SwiftUI twin** (known-correct) — requires Xcode 15+ or Swift 5.9+ with iOS SDK:

```bash
cd swiftui-twin && swift build
```

**Divergent twin** (negative control) — same toolchain:

```bash
cd swiftui-twin-divergent && swift build
```

Preview in Xcode: open either package; the `#Preview` renders the screen in
an iPhone 15 Pro simulator. `.build/` is gitignored — never commit it.

---

## Updating this pair

If any token value is changed:
1. Update `tokens.json`.
2. Update the matching `--*` custom property in `h5-twin/style.css`.
3. Update the matching constant in `swiftui-twin/.../CalibrationScreen.swift`.
4. Re-run Stage 2.5 calibration to re-measure the floor.

The known-correct trio (`tokens.json`, `h5-twin/style.css`,
`swiftui-twin/.../CalibrationScreen.swift`) must stay in sync; `tokens.json`
is the single source of truth. The **divergent twin is intentionally NOT in
sync** — its job is to differ; only keep it textured (text + stripes) and
buildable.
