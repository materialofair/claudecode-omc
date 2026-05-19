// swift-tools-version: 5.9
// Calibration DIVERGENT Twin — SwiftUI Package (NEGATIVE CONTROL)
//
// This package is the deliberately-WRONG SwiftUI screen used as the Stage 5
// judge negative control. The independent judge MUST reject this vs the H5
// twin; if it does not, its YES is voided for that run (see
// references/visual-diff-loop-protocol.md and evaluate-convergence.mjs).
//
// Zero third-party dependencies. Requires Xcode 15+ / Swift 5.9+.

import PackageDescription

let package = Package(
    name: "CalibrationScreenDivergent",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "CalibrationScreenDivergent",
            targets: ["CalibrationScreenDivergent"]
        )
    ],
    targets: [
        .target(
            name: "CalibrationScreenDivergent",
            dependencies: [],
            path: "Sources/CalibrationScreenDivergent"
        )
    ]
)
