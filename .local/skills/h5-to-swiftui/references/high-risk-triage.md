# High-Risk Surface Triage — Stage 1

Triage runs during Stage 1 (static analysis), **before any code generation**. Its
output is `risk-triage.json`. Every surface in the tier catalog below is evaluated
against every discovered usage in the source. Tier assignment is final for a given
iOS floor — it is not re-evaluated per component.

Source: findings.md RQ6 (Android→iOS pilot 2507.16037; lottie-ios 4.3; rive-ios;
Stripe iOS; Firebase iOS; Google Maps SPM; Apple WWDC; WebRTC iOS).

---

## Tier definitions

| Tier | Name | What the skill emits | Compiler behavior | Human action required |
|---|---|---|---|---|
| 1 | **Auto** | Full, correct native implementation | Compiles and runs | Verify behavior, no code change expected |
| 2 | **Assisted** | Compiling stub with `// VERIFY` comment at every deviation | Compiles; may not match source behavior exactly | Review marked deviations; test on device |
| 3 | **Human-only** | Non-compiling stub with `fatalError` + `// OMC-CONVERSION: HUMAN-ONLY` block | **Does not compile by design** | Must be replaced before the app ships |

Tier 3 stubs **must fail to ship**. Using `fatalError`/`preconditionFailure`
ensures the Xcode build reminder is the app crashing at the stub call site during
testing — not a subtle runtime wrong behavior that reaches users. (findings.md RQ6
cites the 2507.16037 pilot: 43.2% of auto-converted files were invalid with no
clean build "without substantial human effort".)

---

## iOS floor awareness

Some conversions are only available above a minimum iOS version. When
`--ios-floor` is below the listed floor, the tier upgrades one level (Tier 1 →
Tier 2 if a workaround exists, Tier 2 → Tier 3 if not).

| API | Minimum iOS |
|---|---|
| `KeyframeAnimator` | 17 |
| `scrollTransition` | 17 |
| `onScrollGeometryChange` | 18 |
| Swift Charts (`Chart`) | 16 |
| `Canvas` | 15 |
| `Layout` protocol | 16 |
| `AVPlayer` with HLS | 7 (always available in v1 scope) |

---

## Tier catalog

Detection signal: file/line reference from static scan + grep of source, not
runtime behavior. The `detect` column is what `scripts/detect-stack.mjs` and the
Stage 1 static analyzer grep for.

| Surface | Detection signal in source | Native iOS counterpart | Tier | Fidelity risk |
|---|---|---|---|---|
| **Lottie `.json` / `.lottie`** | `lottie-web` dep; `new Lottie.loadAnimation`; `.lottie` file references | `lottie-ios 4.3` — same asset file, `LottieAnimationView` | **1 Auto** | Low — asset file identical, timing matches |
| **Rive `.riv`** | `@rive-app/canvas` dep; `new Rive(...)` with `.riv` file | `rive-ios` — same `.riv` asset, `RiveViewModel` | **1 Auto** | Low — asset file identical |
| **REST + JSON** | `fetch('/api/...')`, `axios.get`, `XMLHttpRequest` JSON endpoints | `URLSession.shared.data(from:)` async/await | **1 Auto** | None — semantics equivalent; ATS flag applies to `http://` |
| **HLS `<video>`** | `<video src="...m3u8">`, HLS.js dep | `AVPlayer` + `AVPlayerViewController` or custom `VideoPlayer` | **1 Auto** | Low — HLS is a first-class iOS media format |
| **`localStorage` KV** | `localStorage.getItem`, `localStorage.setItem` | `UserDefaults.standard` | **1 Auto** (non-secrets only) | **Critical caveat:** auth tokens/secrets must NOT go to UserDefaults — see anti-pattern section |
| **Chart.js / D3 charts** | `chart.js` dep; `new Chart(ctx, {type:...})`; `d3` dep with `d3.select` | Swift Charts (`Chart`) iOS 16+ | **2 Assisted** | Medium — data series ports cleanly; custom chart types (radar, custom scales) may not |
| **Static SVG** | Inline `<svg>` elements or `.svg` file `<img>` embeds with no animation | SwiftUI `Path` / `Image(systemName:)` / `Canvas` | **2 Assisted** | Medium — simple shapes port; complex filters, patterns, and gradients require `// VERIFY` |
| **Scroll-linked effects** | `window.addEventListener('scroll', ...)`, `IntersectionObserver`, `scroll-timeline` CSS | `.scrollTransition` (iOS 17+) / `onScrollGeometryChange` (iOS 18+) | **2 Assisted** | Medium — parallax and fade effects port; physics-based scroll effects are Tier 3 |
| **Maps (basic region + markers)** | `google.maps.Map`, `mapboxgl.Map`, `<MapContainer>` (leaflet) basic usage | `MapKit` / `Map` SwiftUI view (iOS 17+) | **2 Assisted** | Medium — region display and pin markers port; custom tile layers, routing UI, Street View are Tier 3 |
| **GSAP / CSS keyframes (linear/cubic)** | `gsap.to(...)` linear/cubic easing; `@keyframes` with `from`/`to` or step keyframes | `KeyframeAnimator` (iOS 17+) / `withAnimation(.easeInOut)` | **2 Assisted** | Medium — simple easing ports; spring physics, morphing, and stagger sequences are Tier 3 |
| **`http://` REST endpoints** | `fetch('http://...')` or `axios.get('http://...')` with non-TLS scheme | `URLSession` with ATS exemption or enforce TLS | **2 Assisted** | High — ATS blocks `http://` by default; emit `// WARNING: ATS — this URL must be upgraded to HTTPS or an ATS exception added to Info.plist` |
| **`IndexedDB` / complex storage** | `indexedDB.open(...)`, `idb` dep | No direct equivalent; use CoreData, SwiftData (iOS 17+), or SQLite | **2 Assisted** | High — data model ports; query API is completely different |
| **Canvas 2D (non-chart)** | `canvas.getContext('2d')`, `ctx.drawImage`, `ctx.fillRect` as primary rendering | SwiftUI `Canvas` (iOS 15+) / `drawRect` in `UIView` | **2 Assisted** (simple drawing) / **3** (pixel-manipulation shaders) | High — drawing commands port individually; `getImageData`/`putImageData` pixel manipulation is Tier 3 |
| **WebGL / WebGPU** | `canvas.getContext('webgl')`, `canvas.getContext('webgpu')`, `three.js`, `babylon.js` deps | Metal / MetalKit / RealityKit (requires GLSL→MSL translation, state model redesign) | **3 Human-only** | Critical — GLSL and WGSL do not mechanically translate to MSL; coordinate system, depth buffer conventions, and GPU state model differ; no automatable path |
| **`requestAnimationFrame` physics** | `requestAnimationFrame` in a game loop or physics update; Matter.js, Cannon.js deps | UIKit `CADisplayLink` or custom physics engine | **3 Human-only** | Critical — frame-loop physics is architectural; no declarative SwiftUI equivalent |
| **WebRTC** | `RTCPeerConnection`, `navigator.mediaDevices.getUserMedia`, `simple-peer` dep | `WebRTC.framework` (Google) or `LiveKit` SDK; requires entitlements + provisioning | **3 Human-only** | Critical — signaling protocol, ICE, and media pipeline require full reimplementation |
| **Stripe.js / payment surfaces** | `@stripe/stripe-js`, `loadStripe(...)`, `CardElement` | Stripe iOS SDK + Apple Pay entitlement | **3 Human-only** | Critical — publishable key handling, webhook secrets, and PCI compliance require human audit; never auto-port |
| **Firebase / OAuth provisioning** | `firebase/auth`, `GoogleSignIn`, `signInWithPopup` | Firebase iOS SDK / GoogleSignIn iOS; requires `GoogleService-Info.plist`, URL schemes, entitlements | **3 Human-only** | High — client IDs, redirect URIs, and entitlement provisioning cannot be inferred from web config |
| **Analytics / ATT** | `gtag`, `mixpanel`, `amplitude`, `posthog`; any event tracking | ATT framework (`AppTrackingTransparency`); native analytics SDK | **3 Human-only** | High — ATT permission prompt must appear before any IDFA access; timing and phrasing are legally significant in some jurisdictions |
| **`SessionStorage` / auth tokens in storage** | `sessionStorage.setItem('token', ...)`, `localStorage.setItem('authToken', ...)` | `Keychain` via `Security.framework` | **3 Human-only** | Critical — see anti-pattern section |

---

## Anti-pattern call-out (never emit these)

These three patterns are the canonical examples of **confident, compiling, subtly
wrong code** — the exact failure mode the skill forbids.

### 1. Auth tokens in UserDefaults (not Keychain)
```swift
// WRONG — never emit this for auth tokens
UserDefaults.standard.set(token, forKey: "authToken")

// Correct — emit a Tier-3 stub instead
// OMC-CONVERSION: HUMAN-ONLY
// Reason: auth tokens must be stored in Keychain (Security.framework kSecClassGenericPassword),
// not UserDefaults. UserDefaults is not encrypted at rest and is accessible without the
// Secure Enclave. Port this using SecItemAdd/SecItemCopyMatching or a Keychain wrapper library.
preconditionFailure("Token storage not implemented — see conversion-report.json")
```

### 2. ATS-dropped `http://` URLs
```swift
// WRONG — compiles but ATS blocks this at runtime on all iOS apps without an exception
let url = URL(string: "http://api.example.com/data")!

// Correct — emit Tier-2 stub with explicit warning
// VERIFY: ATS blocks http:// by default. Either:
// (a) Upgrade the server to https:// (preferred), or
// (b) Add NSAppTransportSecurity > NSAllowsArbitraryLoads exception to Info.plist (not recommended for production).
let url = URL(string: "http://api.example.com/data")! // ATS WARNING — see above
```

### 3. Fake-timed `withAnimation` (mimicking CSS duration with a hardcoded constant)
```swift
// WRONG — not an animation port, it is a guess that will look wrong on different devices
withAnimation(.easeInOut(duration: 0.3)) { ... }

// Correct for Tier-2 (when CSS timing is known):
// VERIFY: CSS animation was 'transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
// The cubic-bezier maps to approximately .timingCurve(0.4, 0, 0.2, 1, duration: 0.3)
// Verify visually against the reference render.
withAnimation(.timingCurve(0.4, 0, 0.2, 1, duration: 0.3)) { ... } // VERIFY
```

---

## Tier-3 non-compiling stub format

Every Tier-3 stub must include the machine-parseable block. This format allows
`conversion-report.json` to be generated by grep, not by LLM post-processing.

```swift
// OMC-CONVERSION: HUMAN-ONLY
// surface: WebGL
// file: src/components/Globe.tsx
// reason: WebGL (Three.js) cannot be automatically converted to Metal/MetalKit.
//   GLSL shaders require manual translation to MSL. GPU state model and coordinate
//   conventions differ. Suggested native counterpart: Metal + SceneKit or RealityKit.
// action: Replace this stub with a Metal-based implementation before shipping.
struct GlobeView: View {
    var body: some View {
        fatalError("GlobeView: WebGL conversion not implemented — OMC-CONVERSION: HUMAN-ONLY")
    }
}
```

The `// OMC-CONVERSION: HUMAN-ONLY` marker on the first line is the grep anchor.
Fields `surface`, `file`, and `reason` are on subsequent `//` lines in `key: value`
format. The `fatalError` is the last statement in `body`.

---

## `conversion-report.json` schema

Aggregated at Stage 7. One entry per triaged surface (all tiers — Tier 1/2 entries
confirm what was auto-handled; Tier 3 entries are the required human action list).

```json
{
  "schema": "h5-to-swiftui/conversion-report@1",
  "generated_at": "2026-05-19T12:00:00Z",
  "ios_floor": 17,
  "surfaces": [
    {
      "surface": "WebGL",
      "file": "Sources/App/Globe/GlobeView.swift",
      "line": 12,
      "severity": "critical",
      "tier": 3,
      "native_counterpart": "Metal + SceneKit or RealityKit",
      "action_required": "Replace fatalError stub with Metal-based implementation; translate GLSL shaders to MSL manually"
    },
    {
      "surface": "Lottie",
      "file": "Sources/App/Onboarding/OnboardingAnimationView.swift",
      "line": 8,
      "severity": "none",
      "tier": 1,
      "native_counterpart": "lottie-ios 4.3 LottieAnimationView",
      "action_required": "None — auto-converted; verify animation timing on device"
    },
    {
      "surface": "http-endpoint",
      "file": "Sources/App/Network/APIClient.swift",
      "line": 34,
      "severity": "high",
      "tier": 2,
      "native_counterpart": "URLSession — upgrade URL to https://",
      "action_required": "Upgrade http:// to https:// or add ATS exception to Info.plist"
    }
  ],
  "summary": {
    "tier1_count": 3,
    "tier2_count": 2,
    "tier3_count": 1,
    "human_action_required": true
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `surface` | string | Short surface name from the tier catalog (e.g. `"WebGL"`, `"Lottie"`, `"REST"`) |
| `file` | string | Output Swift file path (not input H5 file) |
| `line` | integer | Line number of the stub or generated call site in the Swift file |
| `severity` | string | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"` |
| `tier` | integer | 1, 2, or 3 |
| `native_counterpart` | string | Specific framework/API/library to use |
| `action_required` | string | Concrete instruction for the human reviewer |

The `conversion-report.json` is the primary deliverable for communicating what a
human must finish. The final run summary (`convergence-summary.json`) must lead
with `"needs-human": true` and the Tier-3 count when any Tier-3 surfaces are
present.
