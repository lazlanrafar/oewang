import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Top chrome of the Trans. tab: search · "Trans." · favorites · filters.
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
    final fg = context.palette.foreground;
    return SizedBox(
      height: 48,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Search',
            onPressed: onSearchTap,
            icon: Icon(Icons.search, color: fg),
          ),
          Expanded(
            child: Center(
              child: Text(
                'Trans.',
                style: OewangFonts.sans(
                  color: fg,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Favorites',
            onPressed: onFavoritesTap,
            icon: Icon(Icons.star_border, color: fg),
          ),
          IconButton(
            tooltip: 'Filters',
            onPressed: onFiltersTap,
            icon: Icon(Icons.tune, color: fg),
          ),
        ],
      ),
    );
  }
}
