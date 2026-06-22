import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/organisms/transactions/transactions_calendar_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_header.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_picker_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_monthly_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_sub_tab_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_row.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_screen.dart';
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

  @override
  Widget build(BuildContext context) {
    final monthCtl = ref.read(monthControllerProvider.notifier);
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
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
            const TransactionsHeader(),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            Divider(height: 1, color: palette.border),
            MonthPickerBar(
              month: month,
              yearOnly: yearOnlyMonthBar,
              onPrev: monthCtl.prev,
              onNext: monthCtl.next,
            ),
            TransactionsSummaryRow(
              income: totals.income,
              expense: totals.expense,
            ),
            Expanded(
              child: switch (_index) {
                0 => const TransactionsDailyScreen(),
                1 => const TransactionsCalendarScreen(),
                2 => const TransactionsMonthlyScreen(),
                _ => const TransactionsSummaryScreen(),
              },
            ),
          ],
        ),
      ),
    );
  }
}
