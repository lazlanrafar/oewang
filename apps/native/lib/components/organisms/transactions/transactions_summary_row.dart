import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';

/// Income / Exp. / Total roll-up row shown above every Trans. sub-tab.
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
    final palette = context.palette;
    final total = income - expense;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _SummaryCell(
                  label: 'Income',
                  value: income,
                  color: tx.income,
                ),
              ),
              VerticalDivider(width: 17, thickness: 1, color: palette.border),
              Expanded(
                child: _SummaryCell(
                  label: 'Exp.',
                  value: expense,
                  color: tx.expense,
                ),
              ),
              VerticalDivider(width: 17, thickness: 1, color: palette.border),
              Expanded(
                child: _SummaryCell(
                  label: 'Total',
                  value: total,
                  color: palette.foreground,
                ),
              ),
            ],
          ),
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
    final palette = context.palette;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          label,
          style: OewangFonts.sans(color: palette.mutedForeground, fontSize: 12),
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: MoneyText(amount: value, color: color),
        ),
      ],
    );
  }
}
