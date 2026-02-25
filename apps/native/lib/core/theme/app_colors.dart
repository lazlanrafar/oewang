import 'package:flutter/material.dart';

/// Color palette mirroring the shadcn/ui CSS variables.
/// Use via `context.colors.background` instead of static fields.
class AppThemeColors extends ThemeExtension<AppThemeColors> {
  const AppThemeColors({
    required this.background,
    required this.card,
    required this.cardElevated,
    required this.primary,
    required this.primaryForeground,
    required this.foreground,
    required this.mutedForeground,
    required this.border,
    required this.input,
    required this.inputBorder,
    required this.ring,
    required this.destructive,
    required this.success,
    required this.warning,
    required this.secondary,
  });

  final Color background;
  final Color card;
  final Color cardElevated;
  final Color primary;
  final Color primaryForeground;
  final Color foreground;
  final Color mutedForeground;
  final Color border;
  final Color input;
  final Color inputBorder;
  final Color ring;
  final Color destructive;
  final Color success;
  final Color warning;
  final Color secondary;

  // Aliases for compatibility and cleaner semantics
  Color get surface => card;
  Color get surfaceElevated => cardElevated;
  Color get textPrimary => foreground;
  Color get textSecondary => mutedForeground;
  Color get textDisabled => mutedForeground.withValues(alpha: 0.5);
  Color get divider => border;
  Color get inputFill => input;
  Color get error => destructive;
  Color get income => success;
  Color get expense => destructive;
  Color get muted => secondary;
  Color get accent => secondary;
  Color get secondaryForeground => foreground;
  Color get accentForeground => foreground;

  @override
  AppThemeColors copyWith({
    Color? background,
    Color? card,
    Color? cardElevated,
    Color? primary,
    Color? primaryForeground,
    Color? foreground,
    Color? mutedForeground,
    Color? border,
    Color? input,
    Color? inputBorder,
    Color? ring,
    Color? destructive,
    Color? success,
    Color? warning,
    Color? secondary,
  }) {
    return AppThemeColors(
      background: background ?? this.background,
      card: card ?? this.card,
      cardElevated: cardElevated ?? this.cardElevated,
      primary: primary ?? this.primary,
      primaryForeground: primaryForeground ?? this.primaryForeground,
      foreground: foreground ?? this.foreground,
      mutedForeground: mutedForeground ?? this.mutedForeground,
      border: border ?? this.border,
      input: input ?? this.input,
      inputBorder: inputBorder ?? this.inputBorder,
      ring: ring ?? this.ring,
      destructive: destructive ?? this.destructive,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      secondary: secondary ?? this.secondary,
    );
  }

  @override
  AppThemeColors lerp(ThemeExtension<AppThemeColors>? other, double t) {
    if (other is! AppThemeColors) return this;
    return AppThemeColors(
      background: Color.lerp(background, other.background, t)!,
      card: Color.lerp(card, other.card, t)!,
      cardElevated: Color.lerp(cardElevated, other.cardElevated, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      primaryForeground: Color.lerp(
        primaryForeground,
        other.primaryForeground,
        t,
      )!,
      foreground: Color.lerp(foreground, other.foreground, t)!,
      mutedForeground: Color.lerp(mutedForeground, other.mutedForeground, t)!,
      border: Color.lerp(border, other.border, t)!,
      input: Color.lerp(input, other.input, t)!,
      inputBorder: Color.lerp(inputBorder, other.inputBorder, t)!,
      ring: Color.lerp(ring, other.ring, t)!,
      destructive: Color.lerp(destructive, other.destructive, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      secondary: Color.lerp(secondary, other.secondary, t)!,
    );
  }

  // ── Light Theme Definition ────────────────────────────────────────────────
  static const light = AppThemeColors(
    background: Color(0xFFFFFFFF), // --background
    card: Color(0xFFFFFFFF), // --card
    cardElevated: Color(0xFFF7F6F3), // --popover
    primary: Color(0xFF18181B), // --primary
    primaryForeground: Color(0xFFFAFAFA), // --primary-foreground
    foreground: Color(0xFF121212), // --foreground
    mutedForeground: Color(0xFF71717A), // --muted-foreground
    border: Color(0xFFDBDAD7), // --border
    input: Color(
      0xFFFFFFFF,
    ), // Light mode often uses white inputs or very light gray
    inputBorder: Color(0xFFE4E4E7), // --input
    ring: Color(0xFF18181B), // --ring
    destructive: Color(0xFFEF4444), // --destructive
    success: Color(0xFF10B981), // standard green
    warning: Color(0xFFF59E0B), // standard amber
    secondary: Color(0xFFE6E4E0), // --secondary / --muted
  );

  // ── Dark Theme Definition ─────────────────────────────────────────────────
  static const dark = AppThemeColors(
    background: Color(0xFF0D0D0D), // --background
    card: Color(0xFF121212), // --card
    cardElevated: Color(0xFF1A1A1A),
    primary: Color(0xFFFAFAFA), // --primary
    primaryForeground: Color(0xFF18181B), // --primary-foreground
    foreground: Color(0xFFFAFAFA), // --foreground
    mutedForeground: Color(0xFFA1A1AA), // --muted-foreground
    border: Color(0xFF1C1C1C), // --border
    input: Color(0xFF121212), // dark mode inputs match cards or bg
    inputBorder: Color(0xFF272727),
    ring: Color(0xFFD4D4D8), // --ring
    destructive: Color(0xFFFF383B), // --destructive
    success: Color(0xFF4ADE80), // lighter green for dark mode
    warning: Color(0xFFFBBF24), // lighter amber
    secondary: Color(0xFF1C1C1C), // --secondary / --muted
  );
}

// ── Extension for convenient access ───────────────────────────────────────────
extension BuildContextColors on BuildContext {
  AppThemeColors get colors =>
      Theme.of(this).extension<AppThemeColors>() ?? AppThemeColors.light;
}
