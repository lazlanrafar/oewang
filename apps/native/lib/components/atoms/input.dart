import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Border treatments for [Input], mirroring the web input variants.
enum InputVariant {
  /// Bottom border only (default — used by the in-app settings forms).
  underline,

  /// Full square box border (used by the login / auth forms — Image #50).
  outlined,

  /// Grey filled box, no visible border.
  filled,
}

/// The app's standard text field. Pick a [variant] for the border treatment
/// and pass [label] to render a label above the field. Use this instead of a
/// raw [TextField] so inputs stay visually identical across screens.
class Input extends StatefulWidget {
  const Input({
    required this.controller,
    this.label,
    this.hintText,
    this.variant = InputVariant.underline,
    this.autofocus = false,
    this.obscureText = false,
    this.keyboardType,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    super.key,
  });

  final TextEditingController controller;
  final String? label;
  final String? hintText;
  final InputVariant variant;
  final bool autofocus;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<Input> createState() => _InputState();
}

class _InputState extends State<Input> {
  // Reveal toggle for obscured (password) fields.
  late bool _obscured = widget.obscureText;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    final field = TextField(
      controller: widget.controller,
      autofocus: widget.autofocus,
      obscureText: _obscured,
      keyboardType: widget.keyboardType,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      style: OewangFonts.sans(color: palette.foreground, fontSize: 14),
      decoration: _decoration(palette),
    );

    if (widget.label == null) return field;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label!,
          style: OewangFonts.sans(
            color: palette.foreground,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        field,
      ],
    );
  }

  InputDecoration _decoration(OewangPalette palette) {
    final hint = OewangFonts.sans(color: palette.mutedForeground, fontSize: 14);

    // Right-aligned reveal toggle, only for password (obscured) fields.
    final Widget? suffixIcon = widget.obscureText
        ? IconButton(
            tooltip: _obscured ? 'Show password' : 'Hide password',
            onPressed: () => setState(() => _obscured = !_obscured),
            icon: Icon(
              _obscured ? Icons.visibility_off : Icons.visibility,
              size: 18,
              color: palette.mutedForeground.withValues(alpha: 0.6),
            ),
          )
        : null;

    switch (widget.variant) {
      case InputVariant.underline:
        final border = UnderlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: palette.border),
        );
        return InputDecoration(
          hintText: widget.hintText,
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.background,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
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
        return InputDecoration(
          hintText: widget.hintText,
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.background,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: border,
          enabledBorder: border,
          focusedBorder: border.copyWith(
            borderSide: BorderSide(color: palette.foreground),
          ),
        );
      case InputVariant.filled:
        return InputDecoration(
          hintText: widget.hintText,
          hintStyle: hint,
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: palette.muted,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: const OutlineInputBorder(
            borderRadius: BorderRadius.zero,
            borderSide: BorderSide.none,
          ),
        );
    }
  }
}
