import 'package:flutter/material.dart';

/// Dark-mode color tokens, ported 1:1 from `packages/ui/src/globals.css` (.dark).
///
/// Source of truth: the existing Oewang web app dark theme. Mobile inherits the
/// same palette so users see one product across web and native.
class OewangColors {
  const OewangColors._();

  // Surfaces
  static const Color background = Color(0xFF0D0D0D); // hsl(0 0% 5%)
  static const Color foreground = Color(0xFFFAFAFA); // hsl(0 0% 98%)
  static const Color card = Color(0xFF121212); // hsl(0 0% 7%)
  static const Color cardForeground = Color(0xFFFAFAFA);
  static const Color popover = Color(0xFF121212);
  static const Color popoverForeground = Color(0xFFFAFAFA);

  // Muted / accent / border
  static const Color muted = Color(0xFF1C1C1C); // hsl(0 0% 11%)
  static const Color mutedForeground = Color(0xFF616161); // hsl(0 0% 38%)
  static const Color accent = Color(0xFF1C1C1C);
  static const Color accentForeground = Color(0xFFFAFAFA);
  static const Color border = Color(0xFF1C1C1C);
  static const Color input = Color(0xFF1C1C1C);

  // Primary
  static const Color primary = Color(0xFFFAFAFA);
  static const Color primaryForeground = Color(0xFF18181B);
  static const Color ring = Color(0xFFD4D4D8);

  // Semantic colors (mirror --green / --red / --destructive in dark mode)
  // The web tokens use green for income; the iOS screenshots use blue.
  // Both are exposed; Transaction Settings picks one at runtime.
  static const Color income = Color(0xFF00C781); // hsl(151 100% 39%)
  static const Color incomeBlue = Color(0xFF4D9CFF); // matches IMG_1826
  static const Color expense = Color(0xFFFF5A5F); // hsl(357 85% 64%)
  static const Color destructive = Color(0xFFFF3838); // hsl(359 100% 61%)
  static const Color transferOutline = Color(0xFFFAFAFA);

  // Calendar weekday colors (IMG_1827)
  static const Color sundayRed = expense;
  static const Color saturdayBlue = incomeBlue;
}
