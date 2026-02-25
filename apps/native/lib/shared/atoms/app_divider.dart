import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// A horizontal rule divider with centered label text.
///
/// Used in auth screens as "or continue with" separator.
class AppDivider extends StatelessWidget {
  const AppDivider({super.key, this.label = 'or continue with'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ),
        const Expanded(child: Divider()),
      ],
    );
  }
}
