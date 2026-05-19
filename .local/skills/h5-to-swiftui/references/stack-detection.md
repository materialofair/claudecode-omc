# Stack Detection — Stage 0

Used by `scripts/detect-stack.mjs`. Runs **before any other stage**. Determines
whether the project is in v1 scope; out-of-scope projects stop here with an
explicit written report — they are never guessed past.

---

## Why native rewrite beats WebView shell and mechanical transpilation

Condensed from findings.md RQ1 (sources: kean.blog; Apple "Composing custom
layouts" WWDC22-10056; MDN Specificity; LogRocket / Yoga 3.0; dbushell; bjango;
fatbobman; MDN animations; tonsky.me; Android→iOS pilot 2507.16037).

| Route | Fidelity ceiling | Core failure mechanism |
|---|---|---|
| WebView shell (Capacitor / Cordova / Ionic) | ~70–80% | Renders in WebKit, not Core Animation/Metal; ProMotion 120 Hz unavailable to WebKit-rendered content; Dynamic Type needs full reload; rubber-band scroll constant diverges; haptics absent; 2 extra OS processes per instance |
| React Native / NativeScript | ~85–92% | Yoga bridge drops 5 CSS flex properties (`flex-basis`, `flex` shorthand, `wrap-reverse`, `order`, column/row-gap individually); bridge latency; not SwiftUI semantics |
| Flutter (Impeller) | ~80–85% | Own GPU renderer independent of UIKit; iOS conventions require manual Cupertino override throughout |
| Mechanical transpilation (DOM→view tree) | **<60%** | Six structural incompatibilities listed below — errors compound per nesting level |
| **Native rewrite** (this skill) | **100% platform ceiling** | Requires a render-measure-feedback loop; see `visual-diff-loop-protocol.md` |

### Six reasons mechanical transpilation cannot reach pixel-level

1. **Inverted layout protocol.** CSS: parent establishes a containing block;
   child size = content + padding + border + margin. SwiftUI: parent _proposes_
   a size; child _chooses_; parent must honor it. The information-flow direction
   is reversed. Reconstructing it from CSS is underdetermined for nested
   layouts. (kean.blog; Apple "Composing custom layouts".)

2. **No cascade.** CSS resolves styles by global selector specificity +
   inheritance + `!important`. SwiftUI styling is local modifier-chain order +
   downward `environment`. A transpiler needs a full cascade engine; any cascade
   error is a visible defect. (MDN Specificity.)

3. **No 1:1 flex mapping.** Yoga (the most mature CSS-flex bridge) drops
   `flex-basis`, the `flex` shorthand, `wrap-reverse`, `order`, and individual
   `row-gap`/`column-gap`. Errors compound per nesting level. (LogRocket /
   Yoga 3.0.)

4. **Font metric divergence.** WebKit implements `line-height: normal ≈ 1.2`
   against the CSS font spec; SwiftUI uses CoreText metrics directly. Identical
   `16px` declarations yield different line height, advance width, and
   baseline — different wrap column — all subsequent layout shifts. (dbushell;
   bjango.)

5. **Animation model mismatch.** CSS = timeline keyframes on absolute time;
   SwiftUI = state-diff interpolation on Core Animation. Mechanical
   `@keyframes` → `.animation()` diverges in timing, easing, and
   interruptibility. (fatbobman; MDN animations.)

6. **Non-deterministic adaptive spacing.** SwiftUI inserts type-dependent
   spacing and context-sensitive control styling with no CSS source to
   translate from. (tonsky.me.)

**Takeaway:** native rewrite is the only route to the 100% ceiling; transpilation
is at best a draft generator; a render-diff feedback loop is mandatory because
these divergences are invisible to static code diffing.

---

## Detection heuristics table

`detect-stack.mjs` reads `package.json` + a shallow source scan (`.js/.ts/.jsx/
.tsx/.vue/.svelte` in `src/` or root, max 500 files). No network calls.

### Framework detection

| Framework | `package.json` deps (any of) | Source signatures |
|---|---|---|
| React | `react`, `react-dom`, `@types/react` | `import React`, `JSX.Element`, `.jsx`/`.tsx` extensions, `ReactDOM.render`, `createRoot` |
| Vue | `vue`, `@vue/core`, `nuxt` | `.vue` files, `<template>` + `<script setup>`, `createApp` |
| Svelte | `svelte`, `@sveltejs/kit` | `.svelte` files, `<script>` + `<style>` co-located, `$:` reactivity |
| Angular | `@angular/core`, `@angular/common` | `@Component`, `@NgModule`, `.component.ts` suffix pattern |
| Solid | `solid-js`, `@solidjs/router` | `createSignal`, `createEffect`, `.jsx` with no `react` dep |
| Vanilla | none of the above in deps | Bare `addEventListener`, no framework imports, `.js`/`.ts` only |

Confidence scoring: `high` = dep present + source signature found; `medium` =
dep only (source scan inconclusive); `low` = source signature only (dep absent,
e.g. CDN-loaded). At `low` confidence, `detect-stack.mjs` logs a warning and
continues; `in_v1_scope` reflects the most-likely classification.

### Build tool detection

| Build tool | Primary signal | Secondary signal |
|---|---|---|
| Vite | `vite` in deps or devDeps; `vite.config.{js,ts}` present | `"dev": "vite"` in scripts |
| webpack | `webpack` in deps; `webpack.config.{js,cjs,mjs}` present | `"build": "webpack"` in scripts |
| Next.js | `next` in deps; `next.config.{js,mjs,ts}` present | `pages/` or `app/` dir with `page.{tsx,jsx}` |
| Nuxt | `nuxt` in deps; `nuxt.config.{ts,js}` present | `pages/` dir with `.vue` files |
| CRA | `react-scripts` in deps | `"start": "react-scripts start"` in scripts |
| None | none of the above | Single `index.html` + inline `<script>` or `<script type=module>` |

### Styling detection

| Styling system | Detection signal |
|---|---|
| Tailwind v3 | `tailwindcss@^3` in deps; `tailwind.config.{js,ts}` present; class names like `text-sm`, `flex`, `bg-gray-100` in source |
| Tailwind v4 | `tailwindcss@^4` in deps; `@import "tailwindcss"` or `@theme` block in a `.css` file; no `tailwind.config.*` |
| CSS Modules | `.module.css` / `.module.scss` files present; `import styles from '…module.css'` in source |
| Sass / SCSS | `.scss` or `.sass` files; `sass` or `node-sass` in deps |
| CSS-in-JS | `styled-components`, `@emotion/react`, `@emotion/styled`, `@stitches/react`, or `linaria` in deps |
| Plain CSS | None of the above; `.css` files imported directly |

### Router detection

| Router | Detection signal |
|---|---|
| React Router | `react-router-dom` or `react-router` in deps |
| TanStack Router | `@tanstack/react-router` in deps |
| Next.js router | Next.js detected (built-in) |
| Vue Router | `vue-router` in deps |
| Wouter | `wouter` in deps |
| None | Single-page with no router dep |

---

## v1 scope gate

**v1 supports: framework ∈ {vanilla, React}.**

All other detected frameworks (Vue, Svelte, Angular, Solid) are **out of v1 scope**.
`detect-stack.mjs` writes `stack-report.json` and **exits with code 2** (not 0,
not 1 — pipeline scripts detect this as a scope-stop, not an error).

The pipeline does **not** attempt to convert an out-of-scope project. It does not
guess. It does not warn and continue. It stops cleanly so the caller knows exactly
what happened.

### `stack-report.json` schema

```json
{
  "schema": "h5-to-swiftui/stack-report@1",
  "framework": "vue",
  "buildTool": "vite",
  "styling": ["css-modules", "tailwind-v3"],
  "router": "vue-router",
  "confidence": "high",
  "in_v1_scope": false,
  "stop_reason": "detected=vue, out of v1 scope; v1 supports vanilla|React only",
  "detected_at": "2026-05-19T12:00:00Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `framework` | string | `vanilla` \| `react` \| `vue` \| `svelte` \| `angular` \| `solid` \| `unknown` |
| `buildTool` | string | `vite` \| `webpack` \| `next` \| `nuxt` \| `cra` \| `none` \| `unknown` |
| `styling` | string[] | Array; a project may use multiple (e.g. `["tailwind-v3","css-modules"]`) |
| `router` | string | Primary detected router or `none` |
| `confidence` | string | `high` \| `medium` \| `low` |
| `in_v1_scope` | boolean | `true` only when `framework` is `vanilla` or `react` |
| `stop_reason` | string | Present only when `in_v1_scope: false` |
| `detected_at` | string | ISO-8601 timestamp |

When `in_v1_scope: true`, the pipeline proceeds to Stage 1. The `stack-report.json`
is retained as a Stage 0 artifact and its fields inform Stage 1 (token extraction
strategy differs for plain CSS vs Tailwind v4 vs CSS-in-JS) and Stage 4 (component
pattern differs for class components vs function+hooks vs vanilla DOM).
