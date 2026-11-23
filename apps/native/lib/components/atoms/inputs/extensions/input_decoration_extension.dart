import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/input_variant.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Applies the visual [InputVariant] (border + fill + padding) on top of a
/// style's base [InputDecoration], so styles stay about *behaviour* and the
/// variant owns the *look*.
extension InputDecorationVariant on InputDecoration {
  InputDecoration withVariant(
    InputVariant variant,
    OewangPalette palette, {
    Widget? suffixIcon,
  }) {
    final hint = OewangFonts.sans(color: palette.mutedForeground, fontSize: 14);

    switch (variant) {
      case InputVariant.underline:
        final border = UnderlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: palette.border),
        );
        return copyWith(
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.background,
          // Dense + v8 so a text row matches the `Text`-based currency/date/
          // select rows (which also pad v8).
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          border: border,
          enabledBorder: border,
          focusedBorder: border.copyWith(
            borderSide: BorderSide(color: palette.foreground),
          ),
        );
      case InputVariant.outlined:
        final border = OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: palette.border),
        );
        return copyWith(
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.background,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          border: border,
          enabledBorder: border,
          focusedBorder: border.copyWith(
            borderSide: BorderSide(color: palette.foreground),
          ),
        );
      case InputVariant.filled:
        return copyWith(
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.muted,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          border: const OutlineInputBorder(
            borderRadius: BorderRadius.zero,
            borderSide: BorderSide.none,
          ),
        );
      case InputVariant.none:
        return copyWith(
          hintStyle: hint,
          suffixIcon: suffixIcon,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        );
    }
  }
}
