import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/ui/core/money_text.dart';

/// Single row inside the day-grouped list (IMG_1826).
class TransactionRow extends StatelessWidget {
  const TransactionRow({required this.transaction, super.key});

  final Transaction transaction;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final isIncome = transaction.isIncome;
    final amountColor = isIncome ? tx.income : tx.expense;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _CategoryGlyph(category: transaction.category?.name),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  transaction.category?.name ??
                      transaction.name ??
                      'Uncategorized',
                  style: OewangFonts.sans(),
                ),
                if (transaction.wallet != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    transaction.wallet!.name,
                    style: OewangFonts.sans(
                      color: OewangColors.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: MoneyText(
              amount: isIncome ? transaction.amount : const Money(amount: 0),
              color: tx.income,
              textAlign: TextAlign.right,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: MoneyText(
              amount: isIncome ? const Money(amount: 0) : transaction.amount,
              color: amountColor,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryGlyph extends StatelessWidget {
  const _CategoryGlyph({required this.category});

  final String? category;

  static const _emojiByCategory = <String, String>{
    'Food': '🍜',
    'Rent': '🏠',
    'Laundry': '🧣',
    'Transport': '🚕',
    'Coffee': '☕',
    'Salary': '💰',
    'Allowance': '🤑',
  };

  @override
  Widget build(BuildContext context) {
    final emoji = _emojiByCategory[category] ?? '🪙';
    return SizedBox(
      width: 28,
      height: 28,
      child: Center(
        child: Text(emoji, style: const TextStyle(fontSize: 22)),
      ),
    );
  }
}
