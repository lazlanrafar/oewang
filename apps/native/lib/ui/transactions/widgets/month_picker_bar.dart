import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
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
    final fg = context.palette.foreground;
    final label = yearOnly
        ? DateFormat('yyyy').format(month)
        : DateFormat('MMM yyyy').format(month);
    return SizedBox(
      height: 36,
      child: Row(
        children: [
          IconButton(
            onPressed: onPrev,
            icon: Icon(Icons.chevron_left, color: fg),
          ),
          Expanded(
            child: Center(
              child: Text(
                label,
                style: OewangFonts.sans(
                  color: fg,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onNext,
            icon: Icon(Icons.chevron_right, color: fg),
          ),
        ],
      ),
    );
  }
}
