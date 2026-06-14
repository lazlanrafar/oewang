import 'package:flutter/material.dart';

/// Dark-mode color tokens, ported from `packages/ui/src/globals.css` (`.dark`)
/// and Tailwind's `blue-400` / `red-400` (used by the web app for income /
/// expense amount text via `text-blue-400` / `text-red-400` classes).
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

  // Raw palette used for income / expense text. These match Tailwind dark-mode
  // tokens (`blue-400` / `red-400`) the web app uses via the `incomeColor` /
  // `expensesColor` Tailwind classes in `INCOME_EXPENSES_COLOR_OPTIONS`.
  static const Color blue = Color(0xFF60A5FA); // tailwind blue-400
  static const Color red = Color(0xFFF87171); // tailwind red-400

  // The coral red from the web `--red` token (`hsl(357 85% 64%)`) — reserved
  // for the FAB, destructive accents, and the active bottom-nav tint.
  static const Color coral = Color(0xFFFF5A5F);
  static const Color destructive = Color(0xFFFF3838); // hsl(359 100% 61%)
}

/// Maps the raw [OewangColors.blue] / [OewangColors.red] palette onto the
/// semantic "income" / "expense" roles, driven by the
/// `incomeExpensesColor` workspace setting.
///
/// Values mirror `INCOME_EXPENSES_COLOR_OPTIONS` from
/// `packages/constants/src/index.ts` — `blue-red` (default) and `red-blue`.
enum TransactionColorScheme {
  blueRed(
    incomeColor: OewangColors.blue,
    expenseColor: OewangColors.red,
    settingValue: 'blue-red',
  ),
  redBlue(
    incomeColor: OewangColors.red,
    expenseColor: OewangColors.blue,
    settingValue: 'red-blue',
  );

  const TransactionColorScheme({
    required this.incomeColor,
    required this.expenseColor,
    required this.settingValue,
  });

  final Color incomeColor;
  final Color expenseColor;
  final String settingValue;

  static TransactionColorScheme fromSetting(String? value) {
    return switch (value) {
      'red-blue' => TransactionColorScheme.redBlue,
      _ => TransactionColorScheme.blueRed,
    };
  }
}

/// Carries the active [TransactionColorScheme] through the widget tree.
///
/// Read via `Theme.of(context).extension<TransactionColors>()` and override
/// in `ThemeData(extensions: [...])` once the user-settings provider lands
/// (Milestone 9). For now, defaults to [TransactionColorScheme.blueRed].
@immutable
class TransactionColors extends ThemeExtension<TransactionColors> {
  const TransactionColors({required this.scheme});

  factory TransactionColors.defaultBlueRed() =>
      const TransactionColors(scheme: TransactionColorScheme.blueRed);

  final TransactionColorScheme scheme;

  Color get income => scheme.incomeColor;
  Color get expense => scheme.expenseColor;

  @override
  TransactionColors copyWith({TransactionColorScheme? scheme}) {
    return TransactionColors(scheme: scheme ?? this.scheme);
  }

  @override
  TransactionColors lerp(ThemeExtension<TransactionColors>? other, double t) {
    if (other is! TransactionColors) return this;
    return t < 0.5 ? this : other;
  }
}
