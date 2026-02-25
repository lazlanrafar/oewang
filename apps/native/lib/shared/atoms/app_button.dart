import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Variant of [AppButton].
enum AppButtonVariant { primary, outlined, text, ghost, destructive }

/// Reusable app-wide button atom styled like shadcn/ui.
///
/// Usage:
/// ```dart
/// AppButton(label: 'Sign In', onPressed: _submit)
/// AppButton.outlined(label: 'Cancel', onPressed: _cancel)
/// AppButton.text(label: 'Forgot password?', onPressed: _forgot)
/// ```
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.defaultSize,
  });

  const AppButton.outlined({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.defaultSize,
  }) : variant = AppButtonVariant.outlined;

  const AppButton.text({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = false,
    this.size = AppButtonSize.defaultSize,
  }) : variant = AppButtonVariant.text;

  const AppButton.ghost({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.defaultSize,
  }) : variant = AppButtonVariant.ghost;

  const AppButton.destructive({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.defaultSize,
  }) : variant = AppButtonVariant.destructive;

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;
  final Widget? leadingIcon;
  final bool fullWidth;
  final AppButtonSize size;

  @override
  Widget build(BuildContext context) {
    // shadcn heights: sm/h-9 (36), default/h-10 (40), lg/h-11 (44px)
    final height = switch (size) {
      AppButtonSize.sm => 36.0,
      AppButtonSize.defaultSize => 44.0,
      AppButtonSize.lg => 48.0,
      AppButtonSize.icon => 40.0,
    };

    final fontSize = switch (size) {
      AppButtonSize.sm => 13.0,
      AppButtonSize.defaultSize => 14.0,
      AppButtonSize.lg => 15.0,
      AppButtonSize.icon => 14.0,
    };

    final minSize = Size(fullWidth ? double.infinity : 0, height);
    final child = _buildChild(context, fontSize);

    return switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          minimumSize: minSize,
          backgroundColor: context.colors.primary,
          foregroundColor: context.colors.primaryForeground,
        ),
        child: child,
      ),
      AppButtonVariant.destructive => ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          minimumSize: minSize,
          backgroundColor: context.colors.destructive,
          foregroundColor: Colors.white,
        ),
        child: child,
      ),
      AppButtonVariant.outlined => OutlinedButton(
        onPressed: isLoading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: minSize,
          foregroundColor: context.colors.foreground,
          side: BorderSide(color: context.colors.border, width: 1),
        ),
        child: child,
      ),
      AppButtonVariant.text => TextButton(
        onPressed: isLoading ? null : onPressed,
        style: TextButton.styleFrom(
          minimumSize: minSize,
          foregroundColor: context.colors.foreground,
        ),
        child: child,
      ),
      AppButtonVariant.ghost => TextButton(
        onPressed: isLoading ? null : onPressed,
        style: TextButton.styleFrom(
          minimumSize: minSize,
          foregroundColor: context.colors.foreground,
        ),
        child: child,
      ),
    };
  }

  Widget _buildChild(BuildContext context, double fontSize) {
    if (isLoading) {
      return SizedBox(
        height: 18,
        width: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color:
              (variant == AppButtonVariant.primary ||
                  variant == AppButtonVariant.destructive)
              ? (variant == AppButtonVariant.primary
                    ? context.colors.primaryForeground
                    : Colors.white)
              : context.colors.foreground,
        ),
      );
    }

    if (leadingIcon != null) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          leadingIcon!,
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w500,
              fontFamily: 'Inter',
              letterSpacing: -0.1,
            ),
          ),
        ],
      );
    }

    return Text(
      label,
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w500,
        fontFamily: 'Inter',
        letterSpacing: -0.1,
      ),
    );
  }
}

enum AppButtonSize { defaultSize, sm, lg, icon }
