import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// All shapes are square by default. The only intentional rounding in the app
/// is on the top edge of modal bottom sheets — those override the shape per
/// `showModalBottomSheet` call.
const RoundedRectangleBorder _squareShape = RoundedRectangleBorder(
  borderRadius: BorderRadius.zero,
);

const OutlineInputBorder _squareInputBorder = OutlineInputBorder(
  borderRadius: BorderRadius.zero,
  borderSide: BorderSide.none,
);

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
      cardTheme: const CardThemeData(
        color: OewangColors.card,
        elevation: 0,
        shape: _squareShape,
        margin: EdgeInsets.zero,
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: OewangColors.card,
        shape: _squareShape,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: OewangColors.card,
        // Bottom sheets are the ONE place where rounded corners stay (top
        // edge only). Per-call shapes can still override this default.
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(shape: _squareShape),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: _squareShape),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: _squareShape),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: _squareShape),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: OewangColors.coral,
        foregroundColor: OewangColors.foreground,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: OewangColors.input,
        border: _squareInputBorder,
        enabledBorder: _squareInputBorder,
        focusedBorder: _squareInputBorder,
        contentPadding: EdgeInsets.symmetric(
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
      cardTheme: const CardThemeData(
        color: OewangColorsLight.card,
        elevation: 0,
        shape: _squareShape,
        margin: EdgeInsets.zero,
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: OewangColorsLight.card,
        shape: _squareShape,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: OewangColorsLight.card,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(shape: _squareShape),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: _squareShape),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: _squareShape),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: _squareShape),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: OewangColorsLight.coral,
        foregroundColor: OewangColors.foreground,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: OewangColorsLight.input,
        border: _squareInputBorder,
        enabledBorder: _squareInputBorder,
        focusedBorder: _squareInputBorder,
        contentPadding: EdgeInsets.symmetric(
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
