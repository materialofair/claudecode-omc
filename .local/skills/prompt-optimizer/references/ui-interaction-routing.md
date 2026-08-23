# UI Interaction Routing

Use this contract only when the user explicitly asks to optimize a prompt about
UI, UX, interaction, or motion. A direct request to change a UI is still an
execution task and must not trigger the advisory-only `prompt-optimizer`.

## Selection rules

1. Confirm the stack from project facts and verify every recommended skill in
   the live `_index.md`.
2. Recommend 3–5 ordered skills by default. Include a skill only when its output
   is consumed by the next step.
3. Start broad Web polish with `impeccable`; add motion specialists only after
   the audit identifies a justified interaction need.
4. Do not recommend `emil-design-eng` or `write-swift`; those routes are owned
   by `impeccable` and the local Swift/SwiftUI pack.

## Comprehensive Web product upgrade

```text
impeccable
  → [prototype]
  → find-animation-opportunities
  → animate
  → review-animations
  → [visual-verdict]
  → verification-before-completion
```

- `impeccable`: visual hierarchy, layout, accessibility, and responsive baseline.
- `prototype`: only when competing interaction directions need comparison.
- `find-animation-opportunities`: identify high-value motion and reject excess.
- `animate`: implement the selected Web motion.
- `review-animations`: check easing, duration, interruption, and reduced motion.
- `visual-verdict`: only when generated screenshots and references exist.

## Existing motion audit

```text
improve-animations → animate → review-animations → [visual-verdict]
```

## Platform and focused routes

- React Native / Expo: use `animate-expo`, then verify on a release build on the
  slowest supported device. Do not append `review-animations`; its standards
  and examples target Web/CSS motion, while `animate-expo` owns the native
  thread, gesture, haptic, and device-performance checks.
- SwiftUI: use `swiftui-ui-patterns` plus the relevant local SwiftUI review or
  performance skill. Never send native SwiftUI work through the Emil Web chain.
- Apple-style Web gestures: `apple-design → animate → review-animations`.
  `apple-design` applies Apple interaction principles to Web; it is not SwiftUI.
- Component/library selection: use `pick-ui-library` before implementation.
- Sonner toast work: use `ask-sonner`; do not add it to unrelated UI prompts.
- Animation terminology only: use `animation-vocabulary` without an execution chain.

## Acceptance criteria to inject

Production UI/motion prompts should cover keyboard and focus behavior,
`prefers-reduced-motion`, responsive states, realistic content, and browser or
device verification. Require before/after evidence when the request says
"improve" or "upgrade" so subjective polish has an observable completion gate.
