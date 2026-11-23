import 'package:flutter/material.dart';
import 'package:oewang/components/molecules/segmented_tabs.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Income / Expense / Transfer selector for the transaction form. Thin wrapper
/// over the reusable [OewangSegmentedTabs] so the segmented style stays
/// consistent with the web app and other call sites.
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
    return OewangSegmentedTabs<TransactionType>(
      selected: selected,
      onChanged: onChanged,
      segments: const [
        SegmentItem(value: TransactionType.income, label: 'Income'),
        SegmentItem(value: TransactionType.expense, label: 'Expense'),
        SegmentItem(value: TransactionType.transfer, label: 'Transfer'),
      ],
    );
  }
}
