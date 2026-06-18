import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// The app's primary action button — mirrors the web `Button` default variant
/// (`bg-primary text-primary-foreground`, square corners, font-medium 14px).
/// Adapted for mobile: full-width with a taller 48px tap target. Includes a
/// built-in loading spinner. Use this for every "Save" / "Submit" button so
/// they stay visually identical.
class Button extends StatelessWidget {
  const Button({
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.height = 48,
    super.key,
  });

  final String label;

  /// `null` disables the button (greyed out, no tap).
  final VoidCallback? onPressed;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      width: double.infinity,
      height: height,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: palette.primary,
          foregroundColor: palette.primaryForeground,
          elevation: 0,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.zero,
          ),
        ),
        onPressed: loading ? null : onPressed,
        child: loading
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: palette.primaryForeground,
                ),
              )
            : Text(
                label,
                style: OewangFonts.sans(
                  color: palette.primaryForeground,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
      ),
    );
  }
}
