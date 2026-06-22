import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Single row inside the day-grouped list (IMG_1826).
class TransactionRow extends StatelessWidget {
  const TransactionRow({required this.transaction, this.onTap, super.key});

  final Transaction transaction;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    final amountColor = switch (transaction.type) {
      TransactionType.income || TransactionType.transferIn => tx.income,
      TransactionType.expense || TransactionType.transferOut => tx.expense,
      TransactionType.transfer => palette.foreground,
    };
    final title = transaction.category?.name ?? transaction.name;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Blank when uncategorized — no category, no name.
                  if (title != null && title.isNotEmpty)
                    Text(
                      title,
                      style: OewangFonts.sans(color: palette.foreground),
                    ),
                  if (transaction.wallet != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      transaction.wallet!.name,
                      style: OewangFonts.sans(
                        color: palette.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            MoneyText(
              amount: transaction.amount,
              color: amountColor,
              textAlign: TextAlign.right,
            ),
          ],
        ),
      ),
    );
  }
}
