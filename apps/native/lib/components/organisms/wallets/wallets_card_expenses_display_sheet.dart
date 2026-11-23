import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

enum CardExpensesDisplayMode { atTheTime, lumpSum }

/// IMG_2251 — bottom-sheet picker for Card expenses display config.
class CardExpensesDisplaySheet extends StatelessWidget {
  const CardExpensesDisplaySheet({required this.current, super.key});

  final CardExpensesDisplayMode current;

  static Future<CardExpensesDisplayMode?> show(
    BuildContext context, {
    required CardExpensesDisplayMode current,
  }) {
    return showModalBottomSheet<CardExpensesDisplayMode>(
      context: context,
      backgroundColor: context.palette.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => CardExpensesDisplaySheet(current: current),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Text(
              'Card expenses display config',
              style: OewangFonts.sans(
                color: palette.foreground,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'The time credit card paid. You can configure your credit card '
              'spendings to be reflected either on the moment of usage, or '
              'show it as a lump sum on your card payment date.',
              textAlign: TextAlign.center,
              style: OewangFonts.sans(
                color: palette.mutedForeground,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Divider(height: 1, color: palette.border),
          _Row(
            label: 'A. At the time',
            selected: current == CardExpensesDisplayMode.atTheTime,
            onTap: () =>
                Navigator.of(context).pop(CardExpensesDisplayMode.atTheTime),
          ),
          Divider(height: 1, color: palette.border),
          _Row(
            label: 'B. Lump sum',
            selected: current == CardExpensesDisplayMode.lumpSum,
            onTap: () =>
                Navigator.of(context).pop(CardExpensesDisplayMode.lumpSum),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = selected ? OewangColors.coral : palette.foreground;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Expanded(
              child: Text(label, style: OewangFonts.sans(color: color)),
            ),
            if (selected)
              const Icon(Icons.check, color: OewangColors.coral, size: 18),
          ],
        ),
      ),
    );
  }
}
