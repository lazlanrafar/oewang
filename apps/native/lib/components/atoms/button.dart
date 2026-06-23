import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Visual styles for [Button], mirroring the web button variants.
enum ButtonVariant {
  /// Filled primary (bg-primary / primary-foreground). Default.
  primary,

  /// Transparent with a border (bordered secondary / social buttons).
  outlined,

  /// Filled coral — destructive actions.
  danger,

  /// Transparent, no border — low-emphasis actions.
  ghost,
}

/// The app's action button — square corners, font-medium 14px, full-width with
/// a 48px tap target and a built-in loading spinner. Pick a [variant] for the
/// emphasis. Use this for every action button so they stay identical.
class Button extends StatelessWidget {
  const Button({
    required this.label,
    required this.onPressed,
    this.variant = ButtonVariant.primary,
    this.leading,
    this.loading = false,
    this.height = 44,
    super.key,
  });

  final String label;

  /// `null` disables the button (greyed out, no tap).
  final VoidCallback? onPressed;
  final ButtonVariant variant;

  /// Optional glyph rendered before the label (e.g. a provider icon).
  final Widget? leading;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (bg, fg, border) = _colors(palette);

    final child = loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 8)],
              Text(
                label,
                style: OewangFonts.sans(
                  color: fg,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          );

    return SizedBox(
      width: double.infinity,
      height: height,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledBackgroundColor: bg,
          disabledForegroundColor: fg.withValues(alpha: 0.5),
          elevation: 0,
          side: border == null ? null : BorderSide(color: border),
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        ),
        onPressed: loading ? null : onPressed,
        child: child,
      ),
    );
  }

  /// (background, foreground, border?) for the variant.
  (Color, Color, Color?) _colors(OewangPalette palette) {
    switch (variant) {
      case ButtonVariant.primary:
        return (palette.primary, palette.primaryForeground, null);
      case ButtonVariant.outlined:
        return (palette.background, palette.foreground, palette.border);
      case ButtonVariant.danger:
        return (OewangColors.coral, Colors.white, null);
      case ButtonVariant.ghost:
        return (palette.background, palette.foreground, null);
    }
  }
}
