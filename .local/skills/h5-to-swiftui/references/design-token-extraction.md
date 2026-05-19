# Design Token Extraction — Stage 1

Used by `scripts/extract-tokens.mjs`. Produces `tokens.json` (W3C DTCG format)
and `token-gaps.json`. Both files are mandatory inputs to Stage 3 (scaffold) and
Stage 4 (per-component rewrite). Stage 4 must never inline a value that belongs
in `token-gaps.json` — see the token-miss rule below.

---

## The static ∪ runtime pipeline

Two extraction passes run unconditionally. Their outputs are merged then
normalized. Neither pass alone is sufficient.

| Pass | What it gives | What it misses | How to run |
|---|---|---|---|
| Static parse | All _declared_ custom props, Tailwind config, Sass vars — complete enumeration including unused tokens | Values behind `calc()`, `var()` chains, media-query overrides, `@layer` override priority | Read source files: CSS `--*` props; `tailwind.config.js` `theme.extend`; `@theme` blocks (Tailwind v4); compiled `.css` output of Sass |
| Runtime `getComputedStyle` | _Resolved_ values as the browser actually computes them — ground truth for any `calc`, `var`, inheritance, or conditional override | Tokens that are declared but never applied to a rendered element | Playwright: load each page, call `getComputedStyle` on a representative element per token class; run twice — once with `prefers-color-scheme: light`, once with `dark` |

Merge rule: static gives the token namespace; runtime gives the resolved value.
If a static token has no runtime-resolved value, keep static value with
`"source": "static-only"` and flag in `token-gaps.json` if the value contains
unresolved `var()` or `calc()`.

Source: findings.md RQ3 (W3C DTCG draft format; Project Wallace; Style
Dictionary v4; Tokens Studio).

---

## Tradeoff table

| Criterion | Static parse only | Runtime only | Static ∪ runtime |
|---|---|---|---|
| Completeness | High — all declared tokens found | Low — only tokens applied to visible elements | High |
| Resolved truth | Low — `var()`/`calc()` unresolved | High — browser computed values | High |
| Dark-mode pairs | Manual inference required | Automatic (run twice) | Automatic |
| Build required | No | Yes (Playwright + dev server or static build) | Dev server preferred; static build acceptable |
| Speed | Fast | Slow (~5–30 s per page) | Moderate (static fast, runtime adds per page) |

---

## Normalization steps (run after merge, in order)

### 1. Color deduplication
Compare all color values using CIEDE2000 (ΔE00). If ΔE00 < 2 between two colors,
they are the same perceptual token — keep the one with the more semantic name
(e.g. `--color-primary` over `--tw-color-blue-600`) and discard the duplicate.
This typically collapses "25 grays" from Tailwind into 4–6 semantic tokens.

### 2. Spacing scale inference
Collect all spacing values (padding, margin, gap, width/height in px/rem). Detect
the base unit: if values cluster around multiples of 4 px (or 0.25 rem), the
project uses a 4 px grid. Flag values that do not fit the inferred scale in
`token-gaps.json` (they may be one-offs or errors). Map to SwiftUI `CGFloat`
points (1 pt = 1 CSS px at 1× logical resolution).

### 3. Type scale grouping
Group font-size values by recurrence. A value appearing on 3+ elements is a
type-scale step. Assign semantic names: `body`, `caption`, `title`, `headline`,
`largeTitle` (follow Apple HIG naming where possible for SwiftUI
`Font.TextStyle` matching). Record both `size` and `weight` per step.

### 4. Light/dark pairing
For each color token, pair the light-scheme resolved value with the dark-scheme
resolved value. Unpaired tokens (no dark equivalent found) are flagged in
`token-gaps.json` with `"issue": "no-dark-pair"`.

---

## `tokens.json` (W3C DTCG draft format — `$value`/`$type`)

```json
{
  "color": {
    "primary": {
      "$value": "#0A7AFF",
      "$type": "color",
      "$description": "Brand primary, resolved from --color-primary via runtime",
      "dark": { "$value": "#3395FF" }
    },
    "background": {
      "$value": "#FFFFFF",
      "$type": "color",
      "dark": { "$value": "#000000" }
    }
  },
  "spacing": {
    "base": { "$value": "4px", "$type": "dimension" },
    "md":   { "$value": "16px", "$type": "dimension" },
    "lg":   { "$value": "24px", "$type": "dimension" }
  },
  "typography": {
    "body": {
      "$type": "typography",
      "$value": { "fontSize": "16px", "fontWeight": "400", "lineHeight": "1.5" }
    },
    "title": {
      "$type": "typography",
      "$value": { "fontSize": "20px", "fontWeight": "600", "lineHeight": "1.3" }
    }
  }
}
```

All values use CSS-native units in the DTCG file. Stage 3 (scaffold) converts to
SwiftUI `CGFloat` / `Font` equivalents during the `DesignTokens` enum generation.

---

## `token-gaps.json` shape

```json
{
  "schema": "h5-to-swiftui/token-gaps@1",
  "gaps": [
    {
      "property": "border-radius",
      "css_value": "var(--radius-card)",
      "resolved_value": null,
      "issue": "unresolved-var",
      "source_file": "src/components/Card.module.css",
      "source_line": 14,
      "action": "manual-extraction-required"
    },
    {
      "property": "color",
      "css_value": "#9B9B9B",
      "issue": "no-dark-pair",
      "source_file": "src/components/Label.tsx",
      "source_line": 8,
      "action": "verify-dark-contrast"
    }
  ]
}
```

---

## The token-miss rule (hard constraint for Stage 4)

> **Any CSS value with no extractable token in `tokens.json` goes to
> `token-gaps.json` and is NEVER silently inlined by Stage 4.**

Stage 4's LLM prompt must include the full `tokens.json` vocabulary and must
instruct the model: "Use only tokens from the provided vocabulary. If a required
value is not in the vocabulary, emit a `// TOKEN-MISSING: <property>` comment and
use the closest token — do not hardcode the raw value."

This rule exists because inlined magic numbers break:
- Dark-mode adaptation (`.colorset` references the token name, not the hex)
- The convergence loop's color ΔE tracking (tokens give expected values)
- Any future design-system update

A Stage 4 component that contains hardcoded color hex, raw spacing numbers, or
raw font sizes without a corresponding `tokens.json` entry fails the idiomatic
lint check and is reprocessed, not delivered.

---

## Style Dictionary → SwiftUI output (Stage 3)

Stage 3 runs Style Dictionary v4 (DTCG-native) on `tokens.json` to produce:

### `DesignTokens.swift` — a Swift enum namespace

```swift
// Auto-generated by extract-tokens.mjs — do not edit manually
import SwiftUI

enum DesignTokens {
    enum Color {
        static let primary       = SwiftUI.Color("dt/primary")
        static let background    = SwiftUI.Color("dt/background")
    }
    enum Spacing {
        static let base: CGFloat = 4
        static let md:   CGFloat = 16
        static let lg:   CGFloat = 24
    }
    enum Typography {
        static let body  = Font.system(size: 16, weight: .regular)
        static let title = Font.system(size: 20, weight: .semibold)
    }
}
```

### XCAssets `.colorset` files (dark-mode automatic)

For each color token pair, Style Dictionary emits a `.colorset` directory with
`Contents.json` containing both light and dark `value` entries. The `dt/<name>`
asset catalog name matches the `SwiftUI.Color("dt/<name>")` initializer above.

This means dark mode requires **no conditional code** in Stage 4 components —
`DesignTokens.Color.primary` automatically resolves to the correct scheme.

---

## Extraction strategy by detected styling system

From `stack-report.json` (`styling` field), `extract-tokens.mjs` selects:

| Detected styling | Static strategy |
|---|---|
| `tailwind-v3` | Parse `tailwind.config.js` `theme` + `theme.extend`; resolve `colors`, `spacing`, `fontSize`, `fontWeight`, `borderRadius` |
| `tailwind-v4` | Parse `@theme` block in the primary CSS entry point; no config file exists |
| `css-modules` | Parse each `.module.css` file for `--*` custom properties; also scan for Compose-style utility patterns |
| `sass` | Parse compiled CSS output (run `sass` if build script present); scan `.scss` for `$var` declarations |
| `css-in-js` | Static parse is limited (values are runtime JS expressions); rely more heavily on the runtime `getComputedStyle` pass; flag all JS-expression values in `token-gaps.json` |
| `plain-css` | Parse all `--*` custom properties in CSS files imported by the entry point |
