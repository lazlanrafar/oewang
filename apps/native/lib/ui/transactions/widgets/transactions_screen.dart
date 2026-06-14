import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/transactions/widgets/sub_tab_bar.dart';
import 'package:oewang/ui/transactions/widgets/transactions_daily_screen.dart';
import 'package:oewang/ui/transactions/widgets/transactions_header.dart';

/// Trans. tab host. Owns the header, sub-tab bar, and renders the active
/// sub-tab body. Sub-tabs other than Daily land in later milestones.
class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  static const _labels = ['Daily', 'Calendar', 'Monthly', 'Summary', 'Description'];
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const TransactionsHeader(),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            const Divider(height: 1, color: OewangColors.border),
            Expanded(
              child: switch (_index) {
                0 => TransactionsDailyScreen(
                  repositoryProvider: transactionsRepositoryProvider,
                ),
                _ => _ComingSoon(label: _labels[_index]),
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ComingSoon extends StatelessWidget {
  const _ComingSoon({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        '$label — coming soon',
        style: OewangFonts.sans(color: OewangColors.mutedForeground),
      ),
    );
  }
}
