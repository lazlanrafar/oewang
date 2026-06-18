import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// The app's standard text field — underline only (bottom border), square
/// corners, 14px. Use this instead of a raw [TextField] so inputs stay
/// visually identical across screens.
class Input extends StatelessWidget {
  const Input({
    required this.controller,
    this.hintText,
    this.autofocus = false,
    this.onSubmitted,
    super.key,
  });

  final TextEditingController controller;
  final String? hintText;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final border = UnderlineInputBorder(
      borderRadius: BorderRadius.zero,
      borderSide: BorderSide(color: palette.border),
    );
    return TextField(
      controller: controller,
      autofocus: autofocus,
      onSubmitted: onSubmitted,
      style: OewangFonts.sans(color: palette.foreground, fontSize: 14),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: OewangFonts.sans(
          color: palette.mutedForeground,
          fontSize: 14,
        ),
        filled: true,
        fillColor: palette.background,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 0, vertical: 14),
        border: border,
        enabledBorder: border,
        focusedBorder: border.copyWith(
          borderSide: BorderSide(color: palette.foreground),
        ),
      ),
    );
  }
}