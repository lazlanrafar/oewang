import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

/// IMG_1827 — full-month grid. One cell per day showing the per-day expense
/// total (income shown smaller above when present). Built from scratch — the
/// `table_calendar` package's grid wasn't flexible enough to render two
/// stacked amounts per cell as the screenshot does.
class TransactionsCalendarScreen extends ConsumerWidget {
  const TransactionsCalendarScreen({required this.month, super.key});

  final DateTime month;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(monthTransactionsNotifierProvider(month));
    return async.when(
      data: (state) => _CalendarGrid(
        month: month,
        transactions: state.items,
        currency: state.summary.currency,
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

class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.month,
    required this.transactions,
    required this.currency,
  });

  final DateTime month;
  final List<Transaction> transactions;

  /// The workspace currency the day figures are in.
  final String currency;

  static const _weekdayLabels = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ];

  Map<DateTime, ({Money income, Money expense})> _byDay() => {
    for (final group in groupByDay(transactions, currency: currency))
      group.date: (income: group.income, expense: group.expense),
  };

  List<DateTime> _gridDays() {
    final first = DateTime(month.year, month.month);
    final leading = first.weekday % 7;
    final start = first.subtract(Duration(days: leading));
    return [for (var i = 0; i < 42; i++) start.add(Duration(days: i))];
  }

  @override
  Widget build(BuildContext context) {
    final days = _gridDays();
    final totals = _byDay();
    final palette = context.palette;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var i = 0; i < 7; i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Center(
                    child: Text(
                      _weekdayLabels[i],
                      style: OewangFonts.sans(
                        color: i == 0
                            ? OewangColors.coral
                            : (i == 6
                                  ? OewangColors.blue
                                  : palette.mutedForeground),
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        Divider(height: 1, color: palette.border),
        Expanded(
          child: GridView.builder(
            padding: EdgeInsets.zero,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.78,
            ),
            itemCount: days.length,
            itemBuilder: (context, index) {
              final day = days[index];
              final inMonth = day.month == month.month;
              final t = totals[DateTime(day.year, day.month, day.day)];
              return _DayCell(day: day, inMonth: inMonth, totals: t);
            },
          ),
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.inMonth,
    required this.totals,
  });

  final DateTime day;
  final bool inMonth;
  final ({Money income, Money expense})? totals;

  String _dayLabel() {
    if (day.day == 1) {
      return DateFormat('MM/dd').format(day);
    }
    return day.day.toString();
  }

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    final isSun = day.weekday == DateTime.sunday;
    final isSat = day.weekday == DateTime.saturday;
    final isToday = _isSameDay(day, DateTime.now());

    Color labelColor;
    if (!inMonth) {
      labelColor = palette.mutedForeground;
    } else if (isSun) {
      labelColor = OewangColors.coral;
    } else if (isSat) {
      labelColor = OewangColors.blue;
    } else {
      labelColor = palette.foreground;
    }

    return Container(
      decoration: BoxDecoration(
        border: Border(
          right: BorderSide(color: palette.border, width: 0.5),
          bottom: BorderSide(color: palette.border, width: 0.5),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            decoration: isToday
                ? BoxDecoration(color: palette.foreground)
                : null,
            child: Text(
              _dayLabel(),
              style: OewangFonts.sans(
                color: isToday ? palette.background : labelColor,
                fontSize: 12,
                fontWeight: isToday ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
          const Spacer(),
          if (totals != null && !totals!.income.isZero)
            Text(
              _formatShort(totals!.income),
              style: OewangFonts.currency(color: tx.income, fontSize: 10),
            ),
          if (totals != null && !totals!.expense.isZero)
            Text(
              _formatShort(totals!.expense),
              style: OewangFonts.currency(color: tx.expense, fontSize: 10),
            ),
        ],
      ),
    );
  }

  String _formatShort(Money m) => AmountFormat.number(m.amount, decimals: 0);

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
