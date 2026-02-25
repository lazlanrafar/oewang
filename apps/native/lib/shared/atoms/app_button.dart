import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Variant of [AppButton].
enum AppButtonVariant { primary, outlined, text, ghost }

/// Reusable app-wide button atom.
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
    this.size = AppButtonSize.md,
  });

  const AppButton.outlined({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.md,
  }) : variant = AppButtonVariant.outlined;

  const AppButton.text({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = false,
    this.size = AppButtonSize.md,
  }) : variant = AppButtonVariant.text;

  const AppButton.ghost({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leadingIcon,
    this.fullWidth = true,
    this.size = AppButtonSize.md,
  }) : variant = AppButtonVariant.ghost;

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;
  final Widget? leadingIcon;
  final bool fullWidth;
  final AppButtonSize size;

  @override
  Widget build(BuildContext context) {
    final height = switch (size) {
      AppButtonSize.sm => 40.0,
      AppButtonSize.md => 52.0,
      AppButtonSize.lg => 60.0,
    };
    final fontSize = switch (size) {
      AppButtonSize.sm => 13.0,
      AppButtonSize.md => 15.0,
      AppButtonSize.lg => 16.0,
    };

    final minSize = Size(fullWidth ? double.infinity : 0, height);
    final child = _buildChild(fontSize);

    return switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(minimumSize: minSize),
        child: child,
      ),
      AppButtonVariant.outlined => OutlinedButton(
        onPressed: isLoading ? null : onPressed,
        style: OutlinedButton.styleFrom(minimumSize: minSize),
        child: child,
      ),
      AppButtonVariant.text => TextButton(
        onPressed: isLoading ? null : onPressed,
        style: TextButton.styleFrom(minimumSize: minSize),
        child: child,
      ),
      AppButtonVariant.ghost => OutlinedButton(
        onPressed: isLoading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: minSize,
          side: BorderSide(color: AppColors.inputBorder.withValues(alpha: 0.5)),
          foregroundColor: AppColors.textSecondary,
        ),
        child: child,
      ),
    };
  }

  Widget _buildChild(double fontSize) {
    if (isLoading) {
      return SizedBox(
        height: 20,
        width: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: variant == AppButtonVariant.primary
              ? Colors.white
              : AppColors.textSecondary,
        ),
      );
    }

    if (leadingIcon != null) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          leadingIcon!,
          const SizedBox(width: 12),
          Text(
            label,
            style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500),
          ),
        ],
      );
    }

    return Text(label, style: TextStyle(fontSize: fontSize));
  }
}

enum AppButtonSize { sm, md, lg }
