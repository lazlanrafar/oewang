import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// `< Jan 2026 >` bar used across all Trans sub-tabs.
class MonthPickerBar extends StatelessWidget {
  const MonthPickerBar({
    required this.month,
    required this.onPrev,
    required this.onNext,
    this.yearOnly = false,
    super.key,
  });

  final DateTime month;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final bool yearOnly;

  @override
  Widget build(BuildContext context) {
    final label = yearOnly
        ? DateFormat('yyyy').format(month)
        : DateFormat('MMM yyyy').format(month);
    return SizedBox(
      height: 36,
      child: Row(
        children: [
          IconButton(
            onPressed: onPrev,
            icon: const Icon(
              Icons.chevron_left,
              color: OewangColors.foreground,
            ),
          ),
          Expanded(
            child: Center(
              child: Text(
                label,
                style: OewangFonts.sans(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onNext,
            icon: const Icon(
              Icons.chevron_right,
              color: OewangColors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}
