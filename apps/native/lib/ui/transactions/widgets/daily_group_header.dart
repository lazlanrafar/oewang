import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/core/money_text.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';

/// Sticky-style day header in IMG_1826: big day number + weekday chip +
/// per-day Income/Expense totals.
class DailyGroupHeader extends StatelessWidget {
  const DailyGroupHeader({required this.group, super.key});

  final DailyGroup group;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final weekday = DateFormat('EEE').format(group.date);
    final isSunday = group.date.weekday == DateTime.sunday;
    final isSaturday = group.date.weekday == DateTime.saturday;
    final chipColor = isSunday
        ? OewangColors.coral
        : (isSaturday ? OewangColors.blue : OewangColors.mutedForeground);

    return Container(
      color: OewangColors.card,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 40,
            child: Text(
              group.date.day.toString().padLeft(2, '0'),
              style: OewangFonts.sans(
                fontSize: 18,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: chipColor,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              weekday,
              style: OewangFonts.sans(
                color: OewangColors.foreground,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const Spacer(),
          MoneyText(
            amount: group.income,
            color: group.income.isZero
                ? OewangColors.mutedForeground
                : tx.income,
          ),
          const SizedBox(width: 16),
          MoneyText(
            amount: group.expense,
            color: group.expense.isZero
                ? OewangColors.mutedForeground
                : tx.expense,
          ),
        ],
      ),
    );
  }
}
