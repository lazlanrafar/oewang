import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_group_header.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction.dart';

/// IMG_1826 — Daily list. Reads the active month + transactions from the
/// shared `monthTransactionsProvider`, so it never refetches independently.
class TransactionsDailyScreen extends ConsumerWidget {
  const TransactionsDailyScreen({required this.month, super.key});

  final DateTime month;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(monthTransactionsNotifierProvider(month));
    return async.when(
      data: (state) =>
          _DailyList(items: state.items, currency: state.summary.currency),
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

/// The month arrives whole (every page), so the list needs no paging.
class _DailyList extends ConsumerWidget {
  const _DailyList({required this.items, required this.currency});

  final List<Transaction> items;

  /// The workspace currency the day totals are in.
  final String currency;

  /// Answers whether the row may go; a refused delete keeps it and says why.
  Future<bool> _delete(BuildContext context, WidgetRef ref, String id) async {
    final res = await ref.read(transactionsRepositoryProvider).delete(id);
    return res.fold(
      (_) {
        ref.read(transactionsRevisionProvider.notifier).bump();
        return true;
      },
      (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(error.message)));
        }
        return false;
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A viewer gets no edit and no swipe-to-delete (MOB-5).
    final canWrite = ref.watch(canWriteProvider);
    if (items.isEmpty) {
      return Center(
        child: Text(
          'No transactions this month',
          style: OewangFonts.sans(color: context.palette.mutedForeground),
        ),
      );
    }
    final palette = context.palette;
    final groups = groupByDay(items, currency: currency);
    return ColoredBox(
      color: palette.border.withValues(alpha: 0.5),
      child: CustomScrollView(
        slivers: [
          for (final group in groups) ...[
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
                    return Consumer(
                      builder: (context, ref, _) {
                        final settings = ref
                            .watch(transactionSettingsProvider)
                            .valueOrNull;
                        final isDelete = settings?.swipeAction == 'Delete';

                        final rowWidget = DecoratedBox(
                          decoration: BoxDecoration(
                            color: palette.background,
                            border: Border(
                              bottom: BorderSide(color: palette.border),
                            ),
                          ),
                          child: TransactionRow(
                            transaction: t,
                            onTap: canWrite
                                ? () => context.push(
                                    AppRoutes.transactionForm,
                                    extra: t,
                                  )
                                : null,
                          ),
                        );

                        if (!isDelete || !canWrite) {
                          return rowWidget;
                        }

                        return Dismissible(
                          key: ValueKey(t.id),
                          direction: DismissDirection.endToStart,
                          confirmDismiss: (_) async {
                            final confirmed = await showConfirmDialog(
                              context,
                              title: 'Delete transaction?',
                              message:
                                  'Are you sure you want to delete this transaction?',
                            );
                            if (!confirmed || !context.mounted) return false;
                            return _delete(context, ref, t.id);
                          },
                          background: Container(
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 20),
                            color: OewangColors.coral,
                            child: const Icon(
                              Icons.delete_outline,
                              color: Colors.white,
                            ),
                          ),
                          child: rowWidget,
                        );
                      },
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
