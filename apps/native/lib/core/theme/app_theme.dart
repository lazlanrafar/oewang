import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

class AppTheme {
  const AppTheme._();

  static ThemeData dark() {
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
        selectedItemColor: OewangColors.expense,
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
        backgroundColor: OewangColors.expense,
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
    );
  }
}
