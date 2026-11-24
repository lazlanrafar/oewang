import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// Theme-aware surface tokens. Holds the values that flip between dark and
/// light mode (background, card, muted, border, …). Read via
/// `context.palette.<token>` so widgets adapt automatically.
///
/// Brand-fixed colors (coral, blue, red, destructive) remain on
/// [OewangColors] / [OewangColorsLight] and don't go through here.
@immutable
class OewangPalette extends ThemeExtension<OewangPalette> {
  const OewangPalette({
    required this.background,
    required this.foreground,
    required this.card,
    required this.cardForeground,
    required this.muted,
    required this.mutedForeground,
    required this.accent,
    required this.accentForeground,
    required this.border,
    required this.input,
    required this.primary,
    required this.primaryForeground,
  });

  factory OewangPalette.dark() => const OewangPalette(
    background: OewangColors.background,
    foreground: OewangColors.foreground,
    card: OewangColors.card,
    cardForeground: OewangColors.cardForeground,
    muted: OewangColors.muted,
    mutedForeground: OewangColors.mutedForeground,
    accent: OewangColors.accent,
    accentForeground: OewangColors.accentForeground,
    border: OewangColors.border,
    input: OewangColors.input,
    primary: OewangColors.primary,
    primaryForeground: OewangColors.primaryForeground,
  );

  factory OewangPalette.light() => const OewangPalette(
    background: OewangColorsLight.background,
    foreground: OewangColorsLight.foreground,
    card: OewangColorsLight.card,
    cardForeground: OewangColorsLight.cardForeground,
    muted: OewangColorsLight.muted,
    mutedForeground: OewangColorsLight.mutedForeground,
    accent: OewangColorsLight.accent,
    accentForeground: OewangColorsLight.accentForeground,
    border: OewangColorsLight.border,
    input: OewangColorsLight.input,
    primary: OewangColorsLight.primary,
    primaryForeground: OewangColorsLight.primaryForeground,
  );

  final Color background;
  final Color foreground;
  final Color card;
  final Color cardForeground;
  final Color muted;
  final Color mutedForeground;
  final Color accent;
  final Color accentForeground;
  final Color border;
  final Color input;
  final Color primary;
  final Color primaryForeground;

  @override
  OewangPalette copyWith({
    Color? background,
    Color? foreground,
    Color? card,
    Color? cardForeground,
    Color? muted,
    Color? mutedForeground,
    Color? accent,
    Color? accentForeground,
    Color? border,
    Color? input,
    Color? primary,
    Color? primaryForeground,
  }) {
    return OewangPalette(
      background: background ?? this.background,
      foreground: foreground ?? this.foreground,
      card: card ?? this.card,
      cardForeground: cardForeground ?? this.cardForeground,
      muted: muted ?? this.muted,
      mutedForeground: mutedForeground ?? this.mutedForeground,
      accent: accent ?? this.accent,
      accentForeground: accentForeground ?? this.accentForeground,
      border: border ?? this.border,
      input: input ?? this.input,
      primary: primary ?? this.primary,
      primaryForeground: primaryForeground ?? this.primaryForeground,
    );
  }

  @override
  OewangPalette lerp(ThemeExtension<OewangPalette>? other, double t) {
    if (other is! OewangPalette) return this;
    return OewangPalette(
      background: Color.lerp(background, other.background, t) ?? background,
      foreground: Color.lerp(foreground, other.foreground, t) ?? foreground,
      card: Color.lerp(card, other.card, t) ?? card,
      cardForeground:
          Color.lerp(cardForeground, other.cardForeground, t) ?? cardForeground,
      muted: Color.lerp(muted, other.muted, t) ?? muted,
      mutedForeground:
          Color.lerp(mutedForeground, other.mutedForeground, t) ??
          mutedForeground,
      accent: Color.lerp(accent, other.accent, t) ?? accent,
      accentForeground:
          Color.lerp(accentForeground, other.accentForeground, t) ??
          accentForeground,
      border: Color.lerp(border, other.border, t) ?? border,
      input: Color.lerp(input, other.input, t) ?? input,
      primary: Color.lerp(primary, other.primary, t) ?? primary,
      primaryForeground:
          Color.lerp(primaryForeground, other.primaryForeground, t) ??
          primaryForeground,
    );
  }
}

/// Shortcut so widgets read tokens as `context.palette.background`.
extension OewangPaletteOf on BuildContext {
  OewangPalette get palette => Theme.of(this).extension<OewangPalette>()!;
}
