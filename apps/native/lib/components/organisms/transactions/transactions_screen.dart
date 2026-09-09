import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/organisms/transactions/transactions_calendar_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_header.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_picker_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_monthly_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_sub_tab_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_row.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/domain/models/money.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  static const _labels = ['Daily', 'Calendar', 'Monthly', 'Summary'];
  int _index = 0;
  DateTime? _lastMonth;
  bool _isTransitionForward = true;
  bool _hasAppliedStartScreen = false;

  @override
  Widget build(BuildContext context) {
    final monthCtl = ref.read(monthControllerProvider.notifier);
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    final settings = ref.watch(transactionSettingsProvider).valueOrNull;
    final isChangeDateSwipe = (settings?.swipeAction ?? 'Change Date') == 'Change Date';

    if (!_hasAppliedStartScreen && settings != null) {
      _hasAppliedStartScreen = true;
      final startScreen = settings.startScreen;
      final targetIndex = _labels.indexOf(startScreen);
      if (targetIndex != -1) {
        _index = targetIndex;
      }
    }

    if (_lastMonth != null && _lastMonth != month) {
      _isTransitionForward = month.isAfter(_lastMonth!);
    }
    _lastMonth = month;

    final totals = async.maybeWhen(
      data: computeMonthTotals,
      orElse: () => const MonthTotals(
        income: Money(amount: 0),
        expense: Money(amount: 0),
      ),
    );
    final yearOnlyMonthBar = _index == 2; // Monthly tab shows the year only.
    final palette = context.palette;

    final currentChild = switch (_index) {
      0 => const TransactionsDailyScreen(),
      1 => const TransactionsCalendarScreen(),
      2 => const TransactionsMonthlyScreen(),
      _ => const TransactionsSummaryScreen(),
    };

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            TransactionsHeader(
              onSearchTap: () => context.push(AppRoutes.transactionSearch),
            ),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            Divider(height: 1, color: palette.border),
            MonthPickerBar(
              month: month,
              yearOnly: yearOnlyMonthBar,
              onPrev: () {
                _isTransitionForward = false;
                monthCtl.prev();
              },
              onNext: () {
                _isTransitionForward = true;
                monthCtl.next();
              },
            ),
            TransactionsSummaryRow(
              income: totals.income,
              expense: totals.expense,
            ),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onHorizontalDragEnd: isChangeDateSwipe
                    ? (details) {
                        final velocity = details.primaryVelocity ?? 0;
                        if (velocity < -200) {
                          _isTransitionForward = true;
                          monthCtl.next(); // Swipe kiri -> Bulan berikutnya (Maju)
                        } else if (velocity > 200) {
                          _isTransitionForward = false;
                          monthCtl.prev(); // Swipe kanan -> Bulan sebelumnya (Mundur)
                        }
                      }
                    : null,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  transitionBuilder: (child, animation) {
                    final beginOffset = _isTransitionForward
                        ? const Offset(1, 0)
                        : const Offset(-1, 0);
                    final offsetAnimation = Tween<Offset>(
                      begin: beginOffset,
                      end: Offset.zero,
                    ).animate(
                      CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      ),
                    );
                    return SlideTransition(
                      position: offsetAnimation,
                      child: child,
                    );
                  },
                  child: KeyedSubtree(
                    key: ValueKey('${month.year}-${month.month}-$_index'),
                    child: currentChild,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
