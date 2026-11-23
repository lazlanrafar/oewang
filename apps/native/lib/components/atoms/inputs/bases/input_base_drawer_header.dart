import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_metrics.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// The solid black header bar shared by every input panel: a title on the left,
/// optional [actions], and a close button on the right (white on black, square).
/// [titleWidget], when given, replaces the title text in place (e.g. an
/// inline search field) — the caller is responsible for its own trailing
/// space, no [Spacer] is added alongside it.
class FormDrawerHeader extends StatelessWidget {
  const FormDrawerHeader({
    required this.title,
    this.onClose,
    this.actions = const [],
    this.titleWidget,
    super.key,
  });

  final String title;
  final VoidCallback? onClose;
  final List<Widget> actions;
  final Widget? titleWidget;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: DrawerMetrics.header,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
        child: Row(
          children: [
            if (titleWidget != null)
              Expanded(child: titleWidget!)
            else ...[
              Text(
                title,
                style: OewangFonts.sans(
                  color: DrawerMetrics.onHeader,
                  fontSize: 15,
                ),
              ),
              const Spacer(),
            ],
            ...actions,
            IconButton(
              tooltip: 'Close',
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
