import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Top chrome of the Trans. tab: search · "Trans." · favorites · filters.
/// Matches the header pattern in IMG_1826 / IMG_1827 / IMG_1828 / IMG_1829.
class TransactionsHeader extends StatelessWidget {
  const TransactionsHeader({
    this.onSearchTap,
    this.onFavoritesTap,
    this.onFiltersTap,
    super.key,
  });

  final VoidCallback? onSearchTap;
  final VoidCallback? onFavoritesTap;
  final VoidCallback? onFiltersTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Search',
            onPressed: onSearchTap,
            icon: const Icon(Icons.search, color: OewangColors.foreground),
          ),
          Expanded(
            child: Center(
              child: Text(
                'Trans.',
                style: OewangFonts.sans(
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Favorites',
            onPressed: onFavoritesTap,
            icon: const Icon(
              Icons.star_border,
              color: OewangColors.foreground,
            ),
          ),
          IconButton(
            tooltip: 'Filters',
            onPressed: onFiltersTap,
            icon: const Icon(Icons.tune, color: OewangColors.foreground),
          ),
        ],
      ),
    );
  }
}
