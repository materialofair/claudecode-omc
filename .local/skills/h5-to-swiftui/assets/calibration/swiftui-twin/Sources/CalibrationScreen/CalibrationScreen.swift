// CalibrationScreen.swift
// Calibration Twin — SwiftUI side of the Stage 2.5 render-equivalence pair.
//
// IMPORTANT: every color, size, and spacing constant here derives from the
// same design-token values in tokens.json and h5-twin/style.css.
// Do NOT change any value without updating all three files.
//
// Layout target: iPhone 15 Pro logical viewport 393×852 pt,
// with a 59 pt top safe-area inset equivalent.

import SwiftUI

// ── Design Tokens ────────────────────────────────────────────────────────── //
// Hex → Color(red:green:blue:) conversions use the formula r/255, g/255, b/255
// with sRGB color space (matching the CSS hex values in style.css).

private enum Tokens {
    // Colors
    // #F2F2F7  →  r=0xF2/255=0.9490  g=0xF2/255=0.9490  b=0xF7/255=0.9686
    static let colorBackground   = Color(red: 0xF2/255.0, green: 0xF2/255.0, blue: 0xF7/255.0)
    // #4A90D9  →  r=0x4A/255=0.2902  g=0x90/255=0.5647  b=0xD9/255=0.8510
    static let colorCard         = Color(red: 0x4A/255.0, green: 0x90/255.0, blue: 0xD9/255.0)
    // #E8744F  →  r=0xE8/255=0.9098  g=0x74/255=0.4549  b=0x4F/255=0.3098
    static let colorCircle       = Color(red: 0xE8/255.0, green: 0x74/255.0, blue: 0x4F/255.0)

    // Card stripes — structured multi-color region (NOT a flat block) so the
    // measured SSIM floor is meaningful.
    // #4A90D9 blue / #7E57C2 purple / #26A69A teal / #F4B400 amber
    static let colorStripeA      = Color(red: 0x4A/255.0, green: 0x90/255.0, blue: 0xD9/255.0)
    static let colorStripeB      = Color(red: 0x7E/255.0, green: 0x57/255.0, blue: 0xC2/255.0)
    static let colorStripeC      = Color(red: 0x26/255.0, green: 0xA6/255.0, blue: 0x9A/255.0)
    static let colorStripeD      = Color(red: 0xF4/255.0, green: 0xB4/255.0, blue: 0x00/255.0)
    // #1C1C1E  →  r=0x1C/255=0.1098  g=0x1C/255=0.1098  b=0x1E/255=0.1176
    static let colorTextHeading  = Color(red: 0x1C/255.0, green: 0x1C/255.0, blue: 0x1E/255.0)
    // #636366  →  r=0x63/255=0.3882  g=0x63/255=0.3882  b=0x66/255=0.4000
    static let colorTextBody     = Color(red: 0x63/255.0, green: 0x63/255.0, blue: 0x66/255.0)

    // Spacing (pt — 1 pt = 1 CSS px at 1× logical scale)
    static let spaceSafeTop: CGFloat      = 59   // top safe-area equivalent
    static let spacePageH: CGFloat        = 20   // horizontal page padding
    static let spaceSectionGap: CGFloat   = 24   // gap: text block → shape block
    static let spaceCardPadding: CGFloat  = 20   // inner card padding
    static let spaceCardGap: CGFloat      = 16   // gap: card → circle row

    // Radii
    static let radiusCard: CGFloat        = 16

    // Typography (SF System font — closest match to -apple-system CSS)
    static let fontSizeHeading: CGFloat   = 22
    static let fontWeightHeading: Font.Weight = .semibold  // CSS 600
    static let fontSizeBody: CGFloat      = 15
    static let fontWeightBody: Font.Weight    = .regular   // CSS 400

    // Shape
    static let sizeCircle: CGFloat        = 64

    // Screen frame (iPhone 15 Pro logical size)
    static let screenWidth: CGFloat       = 393
    static let screenHeight: CGFloat      = 852
}

// ── CalibrationScreenView ─────────────────────────────────────────────────── //

public struct CalibrationScreenView: View {

    public init() {}

    public var body: some View {
        ZStack(alignment: .topLeading) {
            // Background fills the entire 393×852 frame
            Tokens.colorBackground
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {

                // Safe-area top inset (59 pt) — mirrors --space-safe-top in CSS
                Spacer()
                    .frame(height: Tokens.spaceSafeTop)

                // ── Text Block ──────────────────────────────────────────── //
                VStack(alignment: .leading, spacing: 8) {
                    // Heading: 22pt semibold, color #1C1C1E
                    Text("Calibration Screen")
                        .font(.system(size: Tokens.fontSizeHeading,
                                      weight: Tokens.fontWeightHeading))
                        .foregroundColor(Tokens.colorTextHeading)
                        .lineSpacing(Tokens.fontSizeHeading * (1.27 - 1))
                        // line-height ≈ 1.27 × 22 ≈ 28 pt — matches CSS line-height

                    // Body: 15pt regular, color #636366
                    Text("This screen is the known-correct SwiftUI twin used to measure the cross-renderer fidelity floor. It is not a conversion target.")
                        .font(.system(size: Tokens.fontSizeBody,
                                      weight: Tokens.fontWeightBody))
                        .foregroundColor(Tokens.colorTextBody)
                        .lineSpacing(Tokens.fontSizeBody * (1.47 - 1))
                        // line-height ≈ 1.47 × 15 ≈ 22 pt — matches CSS line-height
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Tokens.spacePageH)

                // Gap between text block and shape block (24 pt)
                Spacer()
                    .frame(height: Tokens.spaceSectionGap)

                // ── Shape Block ─────────────────────────────────────────── //
                VStack(alignment: .leading, spacing: Tokens.spaceCardGap) {

                    // Structured (4-stripe) rounded-rect card, radius 16pt.
                    // Deliberately NOT a flat solid block — a flat region makes
                    // SSIM blind to a uniform mean shift, so the measured floor
                    // would be unreliable. Height = 2 × card padding = 40pt
                    // (same overall card height as the original solid block).
                    HStack(spacing: 0) {
                        Tokens.colorStripeA
                        Tokens.colorStripeB
                        Tokens.colorStripeC
                        Tokens.colorStripeD
                    }
                    .frame(height: Tokens.spaceCardPadding * 2)
                    .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusCard))
                    // width = full content width (set by horizontal padding below)

                    // Circle (#E8744F, 64×64 pt)
                    Circle()
                        .fill(Tokens.colorCircle)
                        .frame(width: Tokens.sizeCircle, height: Tokens.sizeCircle)
                }
                .padding(.horizontal, Tokens.spacePageH)

                Spacer()
            }
            .frame(width: Tokens.screenWidth, alignment: .topLeading)
        }
        .frame(width: Tokens.screenWidth, height: Tokens.screenHeight)
    }
}

// ── Preview ──────────────────────────────────────────────────────────────── //

#Preview("Calibration Screen — 393×852") {
    CalibrationScreenView()
}
