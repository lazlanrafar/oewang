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
    final categoryTitle =
        transaction.category?.name ??
        (transaction.type == TransactionType.transfer
            ? 'Transfer'
            : 'Uncategorized');
    final description =
        (transaction.name != null && transaction.name != categoryTitle)
        ? transaction.name!
        : (transaction.description ?? '');
    final walletName = transaction.type == TransactionType.transfer
        ? '${transaction.wallet?.name ?? ''} → ${transaction.toWallet?.name ?? ''}'
        : (transaction.wallet?.name ?? '');

    final categoryStyle = OewangFonts.sans(
      color: palette.foreground,
      fontSize: 12,
      fontWeight: FontWeight.w500,
    );

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Paling kiri: Kategori Transaksi (dikurangi max width ke 76, font lebih kecil 12px)
            SizedBox(
              width: 76,
              child: Row(
                children: [
                  Flexible(
                    child: Text(
                      categoryTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: categoryStyle,
                    ),
                  ),
                  // Its own text, so a long category name cannot cut it off.
                  if (transaction.otherCategoryCount > 0)
                    Text(
                      ' +${transaction.otherCategoryCount}',
                      style: categoryStyle,
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Tengah: Deskripsi diatas, Akun dibawah
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    description.isNotEmpty ? description : '-',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: OewangFonts.sans(
                      color: description.isNotEmpty
                          ? palette.foreground
                          : palette.mutedForeground,
                      fontSize: 14,
                    ),
                  ),
                  if (walletName.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      walletName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
            // Paling kanan: Harga / Amount
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                MoneyText(
                  amount: transaction.amount,
                  color: amountColor,
                  textAlign: TextAlign.right,
                ),
                // The part in the filtered categories, from the API (TXN-25).
                if (transaction.matchedAmount case final matched?)
                  MoneyText(
                    amount: matched,
                    color: palette.mutedForeground,
                    fontSize: 11,
                    textAlign: TextAlign.right,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
