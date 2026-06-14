import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Milestone 0 smoke screen — verifies that the Oewang dark palette and the
/// Hedvig Letters / Geist Mono fonts render correctly. Replaced by the real
/// shell in Milestone 1.
class SmokeScreen extends StatelessWidget {
  const SmokeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Oewang Mobile',
          style: OewangFonts.sans(
            fontSize: 17,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(OewangSpacing.lg),
        children: [
          Text(
            'Design tokens — dark theme',
            style: OewangFonts.sans(
              fontSize: 20,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: OewangSpacing.lg),
          const _SwatchRow(
            label: 'background',
            color: OewangColors.background,
          ),
          const _SwatchRow(label: 'card', color: OewangColors.card),
          const _SwatchRow(label: 'muted', color: OewangColors.muted),
          const _SwatchRow(
            label: 'foreground',
            color: OewangColors.foreground,
          ),
          const _SwatchRow(
            label: 'expense (FAB)',
            color: OewangColors.expense,
          ),
          const _SwatchRow(
            label: 'income blue',
            color: OewangColors.incomeBlue,
          ),
          const _SwatchRow(label: 'income green', color: OewangColors.income),
          const SizedBox(height: OewangSpacing.xl),
          Text(
            'Typography',
            style: OewangFonts.sans(
              fontSize: 20,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: OewangSpacing.md),
          Text(
            'Hedvig Sans — the quick brown fox',
            style: OewangFonts.sans(fontSize: 16),
          ),
          const SizedBox(height: OewangSpacing.sm),
          Text(
            'Hedvig Serif — Rp 1.952.500,00',
            style: OewangFonts.currency(fontSize: 18),
          ),
          const SizedBox(height: OewangSpacing.sm),
          Text(
            'Geist Mono — const a = 42;',
            style: OewangFonts.mono(fontSize: 14),
          ),
          const SizedBox(height: OewangSpacing.xl),
          Container(
            padding: const EdgeInsets.all(OewangSpacing.lg),
            decoration: BoxDecoration(
              color: OewangColors.card,
              borderRadius: BorderRadius.circular(OewangRadius.lg),
              border: Border.all(color: OewangColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        'Income',
                        style: OewangFonts.sans(
                          color: OewangColors.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: OewangSpacing.xs),
                      Text(
                        '0,00',
                        style: OewangFonts.currency(
                          color: OewangColors.incomeBlue,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        'Exp.',
                        style: OewangFonts.sans(
                          color: OewangColors.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: OewangSpacing.xs),
                      Text(
                        '1.952.500,00',
                        style: OewangFonts.currency(
                          color: OewangColors.expense,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        'Total',
                        style: OewangFonts.sans(
                          color: OewangColors.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: OewangSpacing.xs),
                      Text(
                        '-1.952.500,00',
                        style: OewangFonts.currency(fontSize: 16),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: const Icon(Icons.add),
      ),
    );
  }
}

class _SwatchRow extends StatelessWidget {
  const _SwatchRow({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: OewangSpacing.xs),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(OewangRadius.md),
              border: Border.all(color: OewangColors.border),
            ),
          ),
          const SizedBox(width: OewangSpacing.md),
          Text(label, style: OewangFonts.sans()),
        ],
      ),
    );
  }
}
