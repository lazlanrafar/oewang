import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// A horizontal rule divider with centered label text, matched to shadcn style.
class AppDivider extends StatelessWidget {
  const AppDivider({super.key, this.label = 'or continue with'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            label.toUpperCase(),
            style: TextStyle(
              color: context.colors.mutedForeground,
              fontSize: 12,
              fontWeight: FontWeight.w400,
              letterSpacing: 0.5,
              fontFamily: 'Inter',
            ),
          ),
        ),
        const Expanded(child: Divider()),
      ],
    );
  }
}
