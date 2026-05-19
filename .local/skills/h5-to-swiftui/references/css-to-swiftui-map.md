# CSS → SwiftUI Mapping Reference — Stage 4

This is the lookup table used by the Stage 4 LLM prompt and the idiomatic-lint
checker. Accuracy is critical — this directly drives code generation. Every row
includes a caveat column because a mapping without its caveat is incomplete.

Source: findings.md RQ5 (kean.blog; Hacking with Swift; Swift with Majid;
swiftuifieldguide; Apple WWDC22-10056; tonsky.me; fatbobman).

---

## Flexbox → SwiftUI

| CSS property / value | SwiftUI equivalent | Caveat |
|---|---|---|
| `display: flex; flex-direction: row` | `HStack(alignment:, spacing:)` | Default `HStack()` spacing is non-zero (system-defined); **always pass `spacing: 0`** then add explicit spacing between children |
| `display: flex; flex-direction: column` | `VStack(alignment:, spacing:)` | Same spacing caveat — pass `spacing: 0` |
| `flex-direction: row-reverse` | `HStack` + `.environment(\.layoutDirection, .rightToLeft)` or reverse the child array | Prefer reversing child array when order is data-driven |
| `flex-direction: column-reverse` | `VStack` + reversed child array | No native reverse stack; reversing in data source is cleanest |
| `justify-content: flex-start` | Default (leading) | No modifier needed |
| `justify-content: flex-end` | `Spacer()` before first child | `Spacer()` expands to fill available space |
| `justify-content: center` | `Spacer()` + children + `Spacer()` | Or `.frame(maxWidth: .infinity, alignment: .center)` on the container |
| `justify-content: space-between` | `Spacer()` between each pair of children | Must insert N−1 spacers manually |
| `justify-content: space-around` | `Spacer()` before first, between each, after last | Each spacer gets equal weight; use `Spacer(minLength: 0)` |
| `justify-content: space-evenly` | `Spacer()` at all gaps including edges | Same as `space-around` implementation in SwiftUI |
| `align-items: flex-start` | `HStack(alignment: .top)` / `VStack(alignment: .leading)` | |
| `align-items: center` | `HStack(alignment: .center)` / `VStack(alignment: .center)` | `.center` is the default for HStack |
| `align-items: flex-end` | `HStack(alignment: .bottom)` / `VStack(alignment: .trailing)` | |
| `align-items: stretch` | Default HStack/VStack behavior for views with no explicit frame | Add `.frame(maxWidth: .infinity)` on children that need to stretch |
| `align-items: baseline` | `HStack(alignment: .firstTextBaseline)` | Also `.lastTextBaseline`; applies only to text-bearing children |
| `align-self: <value>` | `.alignmentGuide(alignment, computeValue:)` on the individual child | No direct `align-self` equivalent; alignment guides are complex — use only when necessary |
| `flex-grow: 1` (uniform on all siblings) | `.frame(maxWidth: .infinity)` (in HStack) or `.frame(maxHeight: .infinity)` (in VStack) | Only correct when all siblings have the same grow ratio |
| `flex-grow` (non-uniform ratios) | **Custom `Layout` protocol (iOS 16+)** | See "When you MUST use custom Layout" section below |
| `flex-shrink: 0` | `.fixedSize()` or explicit `.frame(width:, height:)` | Prevents the view from shrinking below its ideal size |
| `flex-shrink: 1` (default) | Default SwiftUI behavior | SwiftUI views compress by default when space is tight |
| `flex-basis: <value>` | `.frame(width: value)` / `.frame(height: value)` | Approximate only; no exact CSS `flex-basis` semantics in SwiftUI |
| `flex-wrap: wrap` | **Custom `Layout` protocol (iOS 16+)** — `FlowLayout` | No `LazyHGrid`/`LazyVGrid` equivalent for true wrapping; see FlowLayout sketch below |
| `flex-wrap: nowrap` | Default HStack/VStack (no wrapping) | |
| `gap: <value>` | `spacing: value` parameter on HStack/VStack | Both row-gap and column-gap map to the same `spacing` param — if they differ, use custom Layout |
| `row-gap: <value>` | `spacing: value` on VStack | |
| `column-gap: <value>` | `spacing: value` on HStack | |
| `order: <n>` | Reorder child array in data source | SwiftUI renders children in declaration order; no runtime reorder modifier exists |

---

## CSS Grid → SwiftUI

SwiftUI's grid support is intentionally limited. Know the ceiling.

| CSS Grid construct | SwiftUI equivalent | Caveat |
|---|---|---|
| `grid-template-columns: repeat(N, 1fr)` | `LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: N))` | Only works for uniform fraction columns; not for mixed units |
| `grid-template-columns: auto-fill minmax(min, max)` | `LazyVGrid(columns: [GridItem(.adaptive(minimum: min, maximum: max))])` | `.adaptive` fills available width automatically |
| `fr` ratios (non-uniform, e.g. `1fr 2fr 1fr`) | **Custom `Layout` protocol (iOS 16+)** | No `LazyVGrid` equivalent; fr ratios require measuring total space and distributing proportionally |
| `grid-template-areas` | Not supported in LazyVGrid/Grid | Use `ZStack` + `.position` for named-area layouts, or custom Layout |
| `grid-column: span N` (eager Grid) | `.gridCellColumns(N)` on the child | Only works inside `Grid` (eager), not `LazyVGrid` |
| `grid-row: span N` | Not supported in LazyVGrid | Requires `Grid` (eager) or custom Layout |
| Explicit line placement (`grid-column: 2 / 4`) | Not supported natively | Custom Layout required |
| Auto-placement (dense) | LazyVGrid default | LazyVGrid uses source order auto-placement; no `grid-auto-flow: dense` |
| `gap` / `column-gap` / `row-gap` | `spacing` on `LazyVGrid` or `Grid` | Sets both axes uniformly; split-axis gap requires custom Layout |
| `Grid` (eager, iOS 16+) | `Grid { GridRow { … } }` | Full alignment control; use for small, known-count grids |
| `LazyVGrid` | `LazyVGrid(columns:, spacing:)` | For large/dynamic lists; less alignment control than `Grid` |

---

## Positioning → SwiftUI

| CSS value | SwiftUI equivalent | Caveat |
|---|---|---|
| `position: static` (default) | Default SwiftUI layout flow | No modifier needed |
| `position: relative` + `top/left/right/bottom` | `.offset(x:, y:)` | `.offset` shifts visually but preserves the layout space — the element still occupies its original slot; this matches CSS `relative` semantics |
| `position: absolute` + `top/left/width/height` | `ZStack` + `.position(x: left + width/2, y: top + height/2)` | **`.position()` takes CENTER coordinates, not top-left.** Compute: `cx = left + width/2`, `cy = top + height/2`. Must be inside a `ZStack` or the position is relative to the parent frame |
| `position: fixed` | `.overlay(alignment:)` on the root view, or `.safeAreaInset(edge:)` | Fixed elements must be moved outside the scrollable content entirely; common for navbars and tab bars |
| `position: sticky` | Manual: `onScrollGeometryChange` (iOS 18+) or `ScrollViewReader` + preference key | No built-in sticky modifier before iOS 18 |
| `z-index: <n>` | `.zIndex(n)` | **Only affects sibling ordering within the same `ZStack`.** A `zIndex` on a view nested inside a VStack has no effect relative to views outside that VStack |
| `inset: 0` (fill parent) | `.frame(maxWidth: .infinity, maxHeight: .infinity)` inside a ZStack | |
| `transform: translate(x, y)` | `.offset(x:, y:)` | |
| `transform: scale(n)` | `.scaleEffect(n)` | Scales visually; does not affect layout space |
| `transform: rotate(deg)` | `.rotationEffect(.degrees(deg))` | |

---

## Box-model drift — the four sources of invisible divergence

These are not missing mappings — they are cases where the CSS and SwiftUI
constructs look equivalent but behave differently. Each one causes layout
divergence that passes code review.

### 1. Margin collapse
**CSS:** Adjacent vertical margins collapse to `max(m1, m2)`.
**SwiftUI:** `VStack(spacing:)` accumulates; two views each with `.padding(.bottom, 16)` produce 32 pt gap, not 16.
**Fix:** Use `VStack(spacing: max(m1, m2))` and remove per-child bottom padding, or set `spacing: 0` and add padding only to one side of each separator pair.

### 2. Border draws inside (not outside)
**CSS default (`content-box`):** `border` expands the element's visible size outward. The content area stays at declared width.
**SwiftUI `.border()`:** draws _inside_ the frame, equivalent to CSS `outline`. The frame size does not change.
**Fix:** Add `.padding(borderWidth)` before `.border()` to match CSS border-box behavior, or use `.overlay(RoundedRectangle(...).stroke(...))` which also draws inside.

### 3. No native percentage sizing
**CSS:** `width: 50%` is resolved by the containing block.
**SwiftUI:** No `%` sizing modifier exists.
**Fix:** Use `GeometryReader` — but **only in `.background{}` or `.overlay{}`**, never as a layout container. `GeometryReader` is greedy (takes all proposed space); using it as a primary layout view breaks parent constraints.

```swift
// Correct pattern for percentage width:
Color.clear
    .frame(maxWidth: .infinity)
    .overlay(
        GeometryReader { geo in
            Rectangle()
                .frame(width: geo.size.width * 0.5)
        }
    )
```

### 4. `line-height` vs `.lineSpacing` differ
**CSS `line-height: 1.5` on 16px font:** applies half-leading (equal space above and below each line). Total line height = 24 px; each side gets 4 px extra.
**SwiftUI `.lineSpacing(n)`:** adds `n` points of space _below_ each line only (no leading above the first line).
**Conversion formula:** `lineSpacing = (cssLineHeight_px − coreTextLineHeight_px)` — i.e., the extra space only, applied as below-line gap.
**iOS 26+:** `.lineHeight(.exact: value)` sets exact line height matching CSS semantics. Use this when `--ios-floor >= 26`.

---

## When you MUST use the custom `Layout` protocol (iOS 16+)

These CSS patterns have **no stock SwiftUI equivalent**. Attempting to approximate
them with HStack/VStack produces incorrect layout. Use `Layout` protocol.

| CSS pattern | Why stock views fail |
|---|---|
| `flex-wrap: wrap` | HStack never wraps; LazyHGrid/LazyVGrid are scroll containers, not inline wrapping layouts |
| Non-uniform `flex-grow` ratios (e.g. `flex-grow: 2` on one child, `flex-grow: 1` on others) | `.frame(maxWidth: .infinity)` distributes equally; no per-child weight |
| Non-uniform `fr` ratios (e.g. `1fr 2fr`) | `GridItem(.flexible())` is always equal weight |
| Radial / circular layouts | No stock radial container exists |

### Minimal correct FlowLayout sketch (iOS 16+)

```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.maxX
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > bounds.minX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
```

This is a production-usable starting point. Add `alignment` and RTL support as
needed. The `cache` type is `Void` (no measurement caching) — add a `Cache` type
when subview measurement is expensive.

---

## Quick-reference: CSS visual properties → SwiftUI modifiers

| CSS | SwiftUI | Note |
|---|---|---|
| `border-radius: N` | `.cornerRadius(N)` or `.clipShape(RoundedRectangle(cornerRadius: N))` | `.cornerRadius` is deprecated in iOS 17+ for `.clipShape` |
| `box-shadow: x y blur spread color` | `.shadow(color:, radius:, x:, y:)` | No `spread` equivalent; `radius` ≈ CSS `blur / 2` |
| `opacity: N` | `.opacity(N)` | |
| `background-color` | `.background(Color.token)` | Use token, not hex |
| `color` | `.foregroundStyle(Color.token)` | `.foregroundColor` deprecated iOS 17+ |
| `font-size` / `font-weight` | `.font(DesignTokens.Typography.body)` | Use extracted token; never hardcode `Font.system(size: 16)` |
| `letter-spacing: N` | `.kerning(N)` | Units: CSS `em`-based vs SwiftUI `pt`-based; convert |
| `text-transform: uppercase` | `.textCase(.uppercase)` | |
| `text-decoration: underline` | `.underline()` | |
| `overflow: hidden` | `.clipped()` | |
| `border: N solid color` | `.overlay(Rectangle().stroke(color, lineWidth: N))` | Draws inside frame |
| `pointer-events: none` | `.allowsHitTesting(false)` | |
| `cursor: pointer` | No equivalent; tap gesture implied by `Button` | |
| `display: none` / `visibility: hidden` | `if condition { view }` or `.opacity(0)` | `if` removes from layout; `.opacity(0)` preserves layout space — choose by CSS analogue |
