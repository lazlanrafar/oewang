import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_group_header.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction.dart';

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
          style: OewangFonts.sans(color: context.palette.mutedForeground),
        ),
      );
    }
    final palette = context.palette;
    final groups = groupByDay(items);
    // Subtle backdrop shows through the gaps between groups; each day group
    // paints a white (background) card on top.
    return ColoredBox(
      color: palette.border.withValues(alpha: 0.5),
      child: CustomScrollView(
      slivers: [
        for (final group in groups) ...[
          // Each group is its own axis group so the pinned header sticks only
          // while this day is on screen — once its rows scroll past, the next
          // day's header takes over the top (one sticky header at a time).
          SliverMainAxisGroup(
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _DayHeaderDelegate(group: group),
              ),
              SliverList.builder(
                itemCount: group.items.length,
                itemBuilder: (context, i) {
                  final t = group.items[i];
                  return ColoredBox(
                    color: palette.background,
                    child: TransactionRow(
                      transaction: t,
                      onTap: () =>
                          context.push(AppRoutes.transactionForm, extra: t),
                    ),
                  );
                },
              ),
            ],
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 8)),
        ],
      ],
      ),
    );
  }
}

/// Pins the day header to the top while its group scrolls underneath.
class _DayHeaderDelegate extends SliverPersistentHeaderDelegate {
  _DayHeaderDelegate({required this.group});

  final DailyGroup group;
  static const double _height = 48;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return SizedBox(
      height: _height,
      child: DailyGroupHeader(group: group),
    );
  }

  @override
  bool shouldRebuild(_DayHeaderDelegate oldDelegate) =>
      oldDelegate.group != group;
}
