import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  const TransactionsDailyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsNotifierProvider(month));
    return async.when(
      data: (state) => _DailyList(
        month: month,
        items: state.items,
        hasMore: state.hasMore,
        isLoadingMore: state.isLoadingMore,
      ),
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

class _DailyList extends ConsumerStatefulWidget {
  const _DailyList({
    required this.month,
    required this.items,
    required this.hasMore,
    required this.isLoadingMore,
  });

  final DateTime month;
  final List<Transaction> items;
  final bool hasMore;
  final bool isLoadingMore;

  @override
  ConsumerState<_DailyList> createState() => _DailyListState();
}

class _DailyListState extends ConsumerState<_DailyList> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (widget.hasMore && !widget.isLoadingMore) {
        ref
            .read(monthTransactionsNotifierProvider(widget.month).notifier)
            .fetchNextPage();
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, String id) async {
    final repo = ref.read(transactionsRepositoryProvider);
    await repo.delete(id);
    ref.read(transactionsRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) {
      return Center(
        child: Text(
          'No transactions this month',
          style: OewangFonts.sans(color: context.palette.mutedForeground),
        ),
      );
    }
    final palette = context.palette;
    final groups = groupByDay(widget.items);
    return ColoredBox(
      color: palette.border.withValues(alpha: 0.5),
      child: CustomScrollView(
        controller: _scrollController,
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
                            onTap: () => context.push(
                              AppRoutes.transactionForm,
                              extra: t,
                            ),
                          ),
                        );

                        if (!isDelete) {
                          return rowWidget;
                        }

                        return Dismissible(
                          key: ValueKey(t.id),
                          direction: DismissDirection.endToStart,
                          confirmDismiss: (_) async {
                            final confirmed = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: const Text('Delete transaction?'),
                                content: const Text(
                                  'Are you sure you want to delete this transaction?',
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.of(ctx).pop(false),
                                    child: const Text('Cancel'),
                                  ),
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.of(ctx).pop(true),
                                    child: const Text(
                                      'Delete',
                                      style: TextStyle(
                                        color: OewangColors.coral,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                            if ((confirmed ?? false) && context.mounted) {
                              await _delete(context, ref, t.id);
                              return true;
                            }
                            return false;
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
