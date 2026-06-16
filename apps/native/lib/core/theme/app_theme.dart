import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

class AppTheme {
  const AppTheme._();

  static ThemeData dark({
    TransactionColorScheme transactionScheme = TransactionColorScheme.blueRed,
  }) {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      colorScheme: const ColorScheme.dark(
        surface: OewangColors.background,
        onSurface: OewangColors.foreground,
        primary: OewangColors.primary,
        onPrimary: OewangColors.primaryForeground,
        secondary: OewangColors.accent,
        onSecondary: OewangColors.accentForeground,
        error: OewangColors.destructive,
        onError: OewangColors.foreground,
      ),
      scaffoldBackgroundColor: OewangColors.background,
      canvasColor: OewangColors.background,
      cardColor: OewangColors.card,
      dividerColor: OewangColors.border,
      textTheme: OewangFonts.textTheme(base.textTheme),
      appBarTheme: const AppBarTheme(
        backgroundColor: OewangColors.background,
        foregroundColor: OewangColors.foreground,
        elevation: 0,
        centerTitle: true,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: OewangColors.background,
        selectedItemColor: OewangColors.coral,
        unselectedItemColor: OewangColors.mutedForeground,
        type: BottomNavigationBarType.fixed,
      ),
      cardTheme: CardThemeData(
        color: OewangColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(OewangRadius.lg),
        ),
        margin: EdgeInsets.zero,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: OewangColors.coral,
        foregroundColor: OewangColors.foreground,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: OewangColors.input,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(OewangRadius.lg),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: OewangSpacing.lg,
          vertical: OewangSpacing.md,
        ),
      ),
      extensions: <ThemeExtension<dynamic>>[
        TransactionColors(scheme: transactionScheme),
        OewangPalette.dark(),
      ],
    );
  }

  /// Light theme ported from the `:root` block of
  /// `packages/ui/src/globals.css`. Built widgets that read colors via
  /// `Theme.of(context).colorScheme` adapt automatically; widgets that still
  /// hardcode `OewangColors.*` constants continue rendering dark and will
  /// migrate to `Theme.of(context)` as needed.
  static ThemeData light({
    TransactionColorScheme transactionScheme = TransactionColorScheme.blueRed,
  }) {
    final base = ThemeData.light(useMaterial3: true);
    return base.copyWith(
      colorScheme: const ColorScheme.light(
        surface: OewangColorsLight.background,
        onSurface: OewangColorsLight.foreground,
        primary: OewangColorsLight.primary,
        onPrimary: OewangColorsLight.primaryForeground,
        secondary: OewangColorsLight.accent,
        onSecondary: OewangColorsLight.accentForeground,
        error: OewangColorsLight.destructive,
        onError: OewangColorsLight.background,
      ),
      scaffoldBackgroundColor: OewangColorsLight.background,
      canvasColor: OewangColorsLight.background,
      cardColor: OewangColorsLight.card,
      dividerColor: OewangColorsLight.border,
      textTheme: OewangFonts.textTheme(base.textTheme).apply(
        bodyColor: OewangColorsLight.foreground,
        displayColor: OewangColorsLight.foreground,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: OewangColorsLight.background,
        foregroundColor: OewangColorsLight.foreground,
        elevation: 0,
        centerTitle: true,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: OewangColorsLight.background,
        selectedItemColor: OewangColorsLight.coral,
        unselectedItemColor: OewangColorsLight.mutedForeground,
        type: BottomNavigationBarType.fixed,
      ),
      cardTheme: CardThemeData(
        color: OewangColorsLight.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(OewangRadius.lg),
        ),
        margin: EdgeInsets.zero,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: OewangColorsLight.coral,
        foregroundColor: OewangColors.foreground,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: OewangColorsLight.input,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(OewangRadius.lg),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: OewangSpacing.lg,
          vertical: OewangSpacing.md,
        ),
      ),
      extensions: <ThemeExtension<dynamic>>[
        TransactionColors(scheme: transactionScheme),
        OewangPalette.light(),
      ],
    );
  }
}
