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
import 'package:oewang/components/organisms/transactions/transactions_sub_tab_carousel.dart';
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

  // Unbounded month carousel: page `_anchorPage` == `_anchorMonth` (captured
  // once at mount), every other page is `_anchorMonth` shifted by
  // `page - _anchorPage` months. ±50,000 months is ±~4166 years from mount —
  // not a real ceiling for this app.
  static const _anchorPage = 50000;
  static const _pageCount = 100001;

  late final PageController _monthPageController;
  late final DateTime _anchorMonth;

  int _index = 0;
  bool _isSubTabForward = true;
  bool _hasAppliedStartScreen = false;

  @override
  void initState() {
    super.initState();
    _anchorMonth = ref.read(monthControllerProvider);
    _monthPageController = PageController(initialPage: _anchorPage);
  }

  @override
  void dispose() {
    _monthPageController.dispose();
    super.dispose();
  }

  int _monthsBetween(DateTime a, DateTime b) =>
      (b.year - a.year) * 12 + (b.month - a.month);

  DateTime _monthForPage(int page) {
    final delta = page - _anchorPage;
    return DateTime(_anchorMonth.year, _anchorMonth.month + delta);
  }

  int _pageForMonth(DateTime month) =>
      _anchorPage + _monthsBetween(_anchorMonth, month);

  @override
  Widget build(BuildContext context) {
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

    // The month carousel is the single source of truth once a drag settles
    // (see onPageChanged below); this only reacts to EXTERNAL changes to the
    // shared provider (e.g. the Stats screen, which reads the same
    // `monthControllerProvider`) by jumping the controller to match. Guarded
    // against feedback: onPageChanged skips writing back when the value
    // already matches, so a jump triggered here never re-fires a write.
    ref.listen<DateTime>(monthControllerProvider, (previous, next) {
      if (!_monthPageController.hasClients) return;
      final currentPage =
          _monthPageController.page?.round() ?? _monthPageController.initialPage;
      final targetPage = _pageForMonth(next);
      if (targetPage != currentPage) {
        _monthPageController.jumpToPage(targetPage);
      }
    });

    final totals = async.maybeWhen(
      data: computeMonthTotals,
      orElse: () => const MonthTotals(
        income: Money(amount: 0),
        expense: Money(amount: 0),
      ),
    );
    final yearOnlyMonthBar = _index == 2; // Monthly tab shows the year only.
    final palette = context.palette;

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
              onSelect: (i) => setState(() {
                _isSubTabForward = i > _index;
                _index = i;
              }),
            ),
            Divider(height: 1, color: palette.border),
            MonthPickerBar(
              month: month,
              yearOnly: yearOnlyMonthBar,
              onPrev: () => _monthPageController.previousPage(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
              ),
              onNext: () => _monthPageController.nextPage(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
              ),
            ),
            TransactionsSummaryRow(
              income: totals.income,
              expense: totals.expense,
            ),
            Expanded(
              child: PageView.builder(
                controller: _monthPageController,
                itemCount: _pageCount,
                physics: isChangeDateSwipe
                    ? const PageScrollPhysics()
                    : const NeverScrollableScrollPhysics(),
                onPageChanged: (page) {
                  final newMonth = _monthForPage(page);
                  if (newMonth != ref.read(monthControllerProvider)) {
                    ref.read(monthControllerProvider.notifier).set(newMonth);
                  }
                },
                itemBuilder: (context, page) {
                  final pageMonth = _monthForPage(page);
                  final content = switch (_index) {
                    0 => TransactionsDailyScreen(month: pageMonth),
                    1 => TransactionsCalendarScreen(month: pageMonth),
                    2 => TransactionsMonthlyScreen(month: pageMonth),
                    _ => TransactionsSummaryScreen(month: pageMonth),
                  };
                  return SubTabCarousel(
                    index: _index,
                    isForward: _isSubTabForward,
                    child: content,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
