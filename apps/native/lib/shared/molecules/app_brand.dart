import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// The Okane brand logo + name molecule.
///
/// Composed of an icon container atom + two Text atoms.
/// Reused on login, register, and splash screens.
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
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(size * 0.25),
          ),
          child: Icon(
            Icons.account_balance_wallet,
            color: Colors.white,
            size: size * 0.5,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Okane',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 2),
        const Text(
          'Personal Finance',
          style: TextStyle(
            color: AppColors.textSecondary,
            fontSize: 12,
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }
}
