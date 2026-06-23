import 'package:flutter/widgets.dart';
import 'package:oewang/core/theme/oewang_palette.dart';

/// Shared sizing + colors so every in-form input panel (amount, category,
/// account, date) is exactly the same size and styling. The panel is a flat,
/// square, full-width "second screen" pinned to the bottom — not a floating
/// rounded drawer.
class DrawerMetrics {
  const DrawerMetrics._();

  /// Fixed content height for all panels (excludes the bottom safe-area inset).
  static const double height = 380;

  /// Panel surface — matches the page background (white in light mode); the
  /// solid black header provides the separation, not elevation.
  static Color surface(BuildContext context) => context.palette.background;

  /// Solid header bar (title + actions) and its foreground.
  static const Color header = Color(0xFF000000);
  static const Color onHeader = Color(0xFFFFFFFF);

  /// Currency selector bar (Rp / S$ / US$) and its selected segment.
  static const Color currencyBar = Color(0xFF2E2E48);
  static const Color currencyBarSelected = Color(0xFF45456A);

  /// Filled square behind the selected calendar day.
  static const Color daySelected = Color(0xFF3C3F5C);
}
