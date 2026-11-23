import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Top chrome of the Trans. tab: search · "Trans.".
class TransactionsHeader extends StatelessWidget {
  const TransactionsHeader({this.onSearchTap, super.key});

  final VoidCallback? onSearchTap;

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
          // Holds the title centred against the search button. The sync
          // status icon that sat here returns with offline writes (OEW-087).
          const SizedBox(width: 48),
        ],
      ),
    );
  }
}
