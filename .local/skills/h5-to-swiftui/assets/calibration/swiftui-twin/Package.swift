// swift-tools-version: 5.9
// Calibration Twin — SwiftUI Package
// Zero third-party dependencies. Requires Xcode 15+ / Swift 5.9+.

import PackageDescription

let package = Package(
    name: "CalibrationScreen",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "CalibrationScreen",
            targets: ["CalibrationScreen"]
        )
    ],
    targets: [
        .target(
            name: "CalibrationScreen",
            dependencies: [],
            path: "Sources/CalibrationScreen"
        )
    ]
)
