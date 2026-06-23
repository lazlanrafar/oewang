import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Daily / Calendar / Monthly / Summary / Description segmented row with a
/// coral underline beneath the active label.
class SubTabBar extends StatelessWidget {
  const SubTabBar({
    required this.labels,
    required this.currentIndex,
    required this.onSelect,
    super.key,
  });

  final List<String> labels;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: 32,
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: InkWell(
                onTap: () => onSelect(i),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      labels[i],
                      style: OewangFonts.sans(
                        color: i == currentIndex
                            ? palette.foreground
                            : palette.mutedForeground,
                        fontSize: 13,
                        fontWeight: i == currentIndex
                            ? FontWeight.w500
                            : FontWeight.w400,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 2,
                      color: i == currentIndex
                          ? palette.foreground
                          : Colors.transparent,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
