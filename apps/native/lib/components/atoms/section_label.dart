import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Grouped-list section header. The leading transparent gap lets a gray card
/// backdrop show through between sections (Daily / Settings grouping pattern).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8), // transparent — gray backdrop shows through
        Container(
          color: palette.background,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            label,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );
  }
}
