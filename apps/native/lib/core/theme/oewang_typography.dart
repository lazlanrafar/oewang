import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// Typography ported from `packages/ui/src/lib/fonts/registry.ts`.
///
/// - sans   — Hedvig Letters Sans (matches `--font-sans` on web).
/// - currency — Hedvig Letters Serif + tabular-nums for `Rp 1.952.500,00`-style
///   numbers (matches commit cad4a22 on web).
/// - mono   — Geist Mono (matches `--font-mono`).
class OewangFonts {
  const OewangFonts._();

  static TextStyle sans({
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w400,
    Color color = OewangColors.foreground,
    double? height,
    double? letterSpacing,
  }) {
    return GoogleFonts.hedvigLettersSans(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
    );
  }

  static TextStyle currency({
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w400,
    Color color = OewangColors.foreground,
  }) {
    return GoogleFonts.hedvigLettersSerif(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
  }

  /// Geist Mono is the web app's `--font-mono`, but it isn't on Google Fonts.
  /// Falls back to Roboto Mono, the closest geometric mono with full glyph
  /// coverage. Swap if a custom Geist Mono asset is added later.
  static TextStyle mono({
    double fontSize = 13,
    FontWeight fontWeight = FontWeight.w400,
    Color color = OewangColors.foreground,
  }) {
    return GoogleFonts.robotoMono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
    );
  }

  static TextTheme textTheme(TextTheme base) {
    return GoogleFonts.hedvigLettersSansTextTheme(base).apply(
      bodyColor: OewangColors.foreground,
      displayColor: OewangColors.foreground,
    );
  }
}
