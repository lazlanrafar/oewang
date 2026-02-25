import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// A pill-shaped badge matching the Shadcn Badge component.
class AppBadge extends StatelessWidget {
  const AppBadge({
    super.key,
    required this.label,
    this.color,
    this.backgroundColor,
  });

  final String label;
  final Color? color;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final fgColor = color ?? context.colors.foreground;
    final bgColor = backgroundColor ?? context.colors.secondary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100), // full pill radius
        border: Border.all(color: context.colors.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: fgColor,
          fontFamily: 'Inter',
        ),
      ),
    );
  }
}
