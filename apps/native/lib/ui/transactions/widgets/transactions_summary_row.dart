import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/ui/core/money_text.dart';

/// Income / Exp. / Total roll-up row shown above every Trans. sub-tab.
/// Matches the row in IMG_1826 / IMG_1827 / IMG_1828 / IMG_1829.
class TransactionsSummaryRow extends StatelessWidget {
  const TransactionsSummaryRow({
    required this.income,
    required this.expense,
    super.key,
  });

  final Money income;
  final Money expense;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final total = income - expense;
    return DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: OewangColors.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
        child: Row(
          children: [
            Expanded(child: _SummaryCell(label: 'Income', value: income, color: tx.income)),
            Expanded(child: _SummaryCell(label: 'Exp.', value: expense, color: tx.expense)),
            Expanded(child: _SummaryCell(label: 'Total', value: total, color: OewangColors.foreground)),
          ],
        ),
      ),
    );
  }
}

class _SummaryCell extends StatelessWidget {
  const _SummaryCell({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final Money value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: OewangFonts.sans(
            color: OewangColors.mutedForeground,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 2),
        MoneyText(amount: value, color: color),
      ],
    );
  }
}
