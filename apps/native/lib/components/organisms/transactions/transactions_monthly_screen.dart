import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_yearly_buckets.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

/// IMG_1828 — month roll-up row + per-week buckets. The current week (if
/// today falls in the visible month) is highlighted in the expense color.
class TransactionsMonthlyScreen extends ConsumerWidget {
  const TransactionsMonthlyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    return async.when(
      data: (txs) => _MonthlyList(month: month, transactions: txs),
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

class _MonthlyList extends StatelessWidget {
  const _MonthlyList({required this.month, required this.transactions});

  final DateTime month;
  final List<Transaction> transactions;

  @override
  Widget build(BuildContext context) {
    final buckets = bucketsForMonth(month, transactions);
    final totals = computeMonthTotals(transactions);
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _MonthRow(month: month, income: totals.income, expense: totals.expense),
        Divider(height: 1, color: palette.border),
        for (final bucket in buckets) ...[
          _BucketRow(
            bucket: bucket,
            isCurrent: isCurrentWeek(bucket),
            incomeColor: tx.income,
            expenseColor: tx.expense,
          ),
          Divider(height: 1, color: palette.border),
        ],
      ],
    );
  }
}

class _MonthRow extends StatelessWidget {
  const _MonthRow({
    required this.month,
    required this.income,
    required this.expense,
  });

  final DateTime month;
  final Money income;
  final Money expense;

  @override
  Widget build(BuildContext context) {
    final monthLabel = DateFormat('MMM').format(month);
    final rangeLabel =
        '${DateFormat('MM/01').format(month)} ~ ${DateFormat('MM/dd').format(DateTime(month.year, month.month + 1, 0))}';
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                monthLabel,
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                rangeLabel,
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              MoneyText(amount: income, color: tx.income),
              MoneyText(amount: expense, color: tx.expense),
              const SizedBox(height: 2),
              Text(
                'Total ${(income - expense).format()}',
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BucketRow extends StatelessWidget {
  const _BucketRow({
    required this.bucket,
    required this.isCurrent,
    required this.incomeColor,
    required this.expenseColor,
  });

  final WeeklyBucket bucket;
  final bool isCurrent;
  final Color incomeColor;
  final Color expenseColor;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final range =
        '${DateFormat('dd/MM').format(bucket.start)} ~ ${DateFormat('dd/MM').format(bucket.end)}';
    final highlight = isCurrent
        ? OewangColors.coral.withValues(alpha: 0.15)
        : Colors.transparent;
    return Container(
      color: highlight,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              range,
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              MoneyText(amount: bucket.income, color: incomeColor),
              MoneyText(amount: bucket.expense, color: expenseColor),
              Text(
                bucket.net.format(),
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
