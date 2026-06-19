import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/drawer_metrics.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// The solid black header bar shared by every input panel: a title on the left,
/// optional [actions], and a close button on the right (white on black, square).
class FormDrawerHeader extends StatelessWidget {
  const FormDrawerHeader({
    required this.title,
    this.onClose,
    this.actions = const [],
    super.key,
  });

  final String title;
  final VoidCallback? onClose;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: DrawerMetrics.header,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
        child: Row(
          children: [
            Text(
              title,
              style: OewangFonts.sans(
                color: DrawerMetrics.onHeader,
                fontSize: 15,
              ),
            ),
            const Spacer(),
            ...actions,
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: const Icon(Icons.close, color: DrawerMetrics.onHeader),
            ),
          ],
        ),
      ),
    );
  }
}
