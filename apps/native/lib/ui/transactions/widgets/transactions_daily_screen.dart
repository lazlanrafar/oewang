import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';
import 'package:oewang/ui/transactions/widgets/daily_group_header.dart';
import 'package:oewang/ui/transactions/widgets/transaction_row.dart';

/// IMG_1826 — Daily list. Reads the active month + transactions from the
/// shared `monthTransactionsProvider`, so it never refetches independently.
class TransactionsDailyScreen extends ConsumerWidget {
  const TransactionsDailyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    return async.when(
      data: (txs) => _DailyList(items: txs),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            e.toString(),
            textAlign: TextAlign.center,
            style: OewangFonts.sans(color: OewangColors.coral),
          ),
        ),
      ),
    );
  }
}

class _DailyList extends StatelessWidget {
  const _DailyList({required this.items});
  final List<Transaction> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Text(
          'No transactions this month',
          style: OewangFonts.sans(color: OewangColors.mutedForeground),
        ),
      );
    }
    final groups = groupByDay(items);
    return ListView.builder(
      itemCount: groups.length,
      itemBuilder: (context, index) {
        final group = groups[index];
        return Column(
          children: [
            DailyGroupHeader(group: group),
            for (final t in group.items) TransactionRow(transaction: t),
          ],
        );
      },
    );
  }
}
