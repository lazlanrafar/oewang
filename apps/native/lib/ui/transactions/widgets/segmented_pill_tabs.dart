import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/transaction.dart';

/// IMG_1830 / IMG_1831 / IMG_1832 — three rounded pills for Income / Expense /
/// Transfer. Active pill carries an outline + label in the type color.
class SegmentedPillTabs extends StatelessWidget {
  const SegmentedPillTabs({
    required this.selected,
    required this.onChanged,
    super.key,
  });

  final TransactionType selected;
  final ValueChanged<TransactionType> onChanged;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    Color colorFor(TransactionType t) => switch (t) {
      TransactionType.income => tx.income,
      TransactionType.expense => tx.expense,
      _ => palette.foreground,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          _Pill(
            label: 'Income',
            isSelected: selected == TransactionType.income,
            activeColor: colorFor(TransactionType.income),
            onTap: () => onChanged(TransactionType.income),
          ),
          const SizedBox(width: 8),
          _Pill(
            label: 'Expense',
            isSelected: selected == TransactionType.expense,
            activeColor: colorFor(TransactionType.expense),
            onTap: () => onChanged(TransactionType.expense),
          ),
          const SizedBox(width: 8),
          _Pill(
            label: 'Transfer',
            isSelected: selected == TransactionType.transfer,
            activeColor: colorFor(TransactionType.transfer),
            onTap: () => onChanged(TransactionType.transfer),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.isSelected,
    required this.activeColor,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final Color activeColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = isSelected ? activeColor : palette.mutedForeground;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.zero,
          child: Container(
            height: 40,
            decoration: BoxDecoration(
              color: palette.card,
              border: Border.all(
                color: isSelected ? activeColor : palette.border,
                width: isSelected ? 1.5 : 1,
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: OewangFonts.sans(
                color: color,
                fontSize: 14,
                fontWeight: isSelected ? FontWeight.w500 : FontWeight.w400,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
