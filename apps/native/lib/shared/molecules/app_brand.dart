import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// The Okane brand logo + name molecule.
class AppBrand extends StatelessWidget {
  const AppBrand({super.key, this.size = 64.0});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: context.colors.primary,
            borderRadius: BorderRadius.circular(
              size * 0.22,
            ), // slightly tighter rounding for shadcn feel
          ),
          child: Icon(
            Icons.account_balance_wallet,
            color: context
                .colors
                .primaryForeground, // use primaryForeground instead of white
            size: size * 0.45, // slightly smaller icon
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Okane',
          style: TextStyle(
            color: context.colors.foreground,
            fontSize: 24,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.8,
            fontFamily: 'Inter',
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Financial Dashboard', // Sounds slightly more professional
          style: TextStyle(
            color: context.colors.mutedForeground,
            fontSize: 13,
            letterSpacing: 0,
            fontWeight: FontWeight.w400,
            fontFamily: 'Inter',
          ),
        ),
      ],
    );
  }
}
