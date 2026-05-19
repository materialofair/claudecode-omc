// CalibrationScreenDivergent.swift
// NEGATIVE CONTROL — the deliberately-WRONG SwiftUI side of the Stage 5
// judge negative control.
//
// This screen is INTENTIONALLY divergent from the H5 twin
// (assets/calibration/h5-twin/index.html):
//   • WRONG colors    — background green not grey, card stripes recolored,
//                        circle blue not coral, text colors inverted.
//   • SHIFTED layout   — larger top inset, different padding, the circle is
//                        moved to the trailing edge, the card is taller and
//                        narrower, section gap doubled.
//   • WRONG copy       — heading/body text differs.
//
// The independent judge MUST reject this pair (H5 twin vs this) under the
// adversarial forced-difference-3 framing. If the judge fails to reject it,
// `judge.negative_control` is recorded as "failed" and any YES verdict is
// VOID for that run (enforced mechanically by evaluate-convergence.mjs).
//
// It is still TEXTURED (text + a multi-color stripe region) so the contrast
// with the correct twin is structural, not just a flat mean shift.

import SwiftUI

private enum WrongTokens {
    // WRONG colors (intentionally divergent from tokens.json)
    static let colorBackground   = Color(red: 0x2E/255.0, green: 0x7D/255.0, blue: 0x32/255.0) // green, should be #F2F2F7
    static let colorCircle       = Color(red: 0x15/255.0, green: 0x65/255.0, blue: 0xC0/255.0) // blue, should be #E8744F
    static let colorTextHeading  = Color(red: 0xFF/255.0, green: 0xFF/255.0, blue: 0xFF/255.0) // white, should be #1C1C1E
    static let colorTextBody     = Color(red: 0xFF/255.0, green: 0xEB/255.0, blue: 0x3B/255.0) // yellow, should be #636366

    // WRONG stripe colors (recolored + reordered)
    static let colorStripeA      = Color(red: 0xD3/255.0, green: 0x2F/255.0, blue: 0x2F/255.0) // red
    static let colorStripeB      = Color(red: 0xFB/255.0, green: 0x8C/255.0, blue: 0x00/255.0) // orange
    static let colorStripeC      = Color(red: 0x00/255.0, green: 0x00/255.0, blue: 0x00/255.0) // black
    static let colorStripeD      = Color(red: 0xFF/255.0, green: 0xFF/255.0, blue: 0xFF/255.0) // white

    // SHIFTED layout (intentionally divergent spacing)
    static let spaceSafeTop: CGFloat      = 140  // should be 59 — large shift
    static let spacePageH: CGFloat        = 48   // should be 20
    static let spaceSectionGap: CGFloat   = 48   // should be 24 — doubled
    static let spaceCardPadding: CGFloat  = 20
    static let spaceCardGap: CGFloat      = 16

    static let radiusCard: CGFloat        = 2    // should be 16 — nearly square
    static let fontSizeHeading: CGFloat   = 34   // should be 22
    static let fontSizeBody: CGFloat      = 11   // should be 15
    static let sizeCircle: CGFloat        = 110  // should be 64 — much larger

    static let screenWidth: CGFloat       = 393
    static let screenHeight: CGFloat      = 852
}

// ── CalibrationScreenDivergentView ────────────────────────────────────────── //

public struct CalibrationScreenDivergentView: View {

    public init() {}

    public var body: some View {
        ZStack(alignment: .topLeading) {
            WrongTokens.colorBackground
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {

                Spacer()
                    .frame(height: WrongTokens.spaceSafeTop)

                // WRONG copy + WRONG type sizes + WRONG colors
                VStack(alignment: .leading, spacing: 8) {
                    Text("WRONG SCREEN — negative control")
                        .font(.system(size: WrongTokens.fontSizeHeading,
                                      weight: .bold))
                        .foregroundColor(WrongTokens.colorTextHeading)

                    Text("If a judge calls this equivalent to the H5 twin, its verdict is void.")
                        .font(.system(size: WrongTokens.fontSizeBody,
                                      weight: .regular))
                        .foregroundColor(WrongTokens.colorTextBody)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, WrongTokens.spacePageH)

                Spacer()
                    .frame(height: WrongTokens.spaceSectionGap)

                VStack(alignment: .leading, spacing: WrongTokens.spaceCardGap) {

                    // Taller, near-square, recolored stripe card
                    HStack(spacing: 0) {
                        WrongTokens.colorStripeA
                        WrongTokens.colorStripeB
                        WrongTokens.colorStripeC
                        WrongTokens.colorStripeD
                    }
                    .frame(height: WrongTokens.spaceCardPadding * 5) // much taller
                    .clipShape(RoundedRectangle(cornerRadius: WrongTokens.radiusCard))

                    // Circle moved to the TRAILING edge, wrong color, much bigger
                    HStack {
                        Spacer()
                        Circle()
                            .fill(WrongTokens.colorCircle)
                            .frame(width: WrongTokens.sizeCircle,
                                   height: WrongTokens.sizeCircle)
                    }
                }
                .padding(.horizontal, WrongTokens.spacePageH)

                Spacer()
            }
            .frame(width: WrongTokens.screenWidth, alignment: .topLeading)
        }
        .frame(width: WrongTokens.screenWidth, height: WrongTokens.screenHeight)
    }
}

// ── Preview ──────────────────────────────────────────────────────────────── //

#Preview("DIVERGENT (negative control) — 393×852") {
    CalibrationScreenDivergentView()
}
