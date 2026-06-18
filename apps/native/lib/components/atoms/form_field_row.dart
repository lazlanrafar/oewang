import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A labelled form row — a fixed-width muted label on the left and an arbitrary
/// [child] on the right. Shared by every row in the transaction / account forms
/// so spacing and label styling stay consistent.
///
/// Optional behaviours (all default off, so existing callers are unchanged):
/// - [height] gives every row the same fixed height.
/// - [showBorder] draws the row's own bottom border (no separate `Divider`).
/// - [focusNode] makes the bottom border black while the field is focused and
///   lets a tap anywhere on the row focus it.
/// - [onTap] runs when the row (label / empty area) is tapped; defaults to
///   focusing [focusNode] when one is given.
class FormFieldRow extends StatelessWidget {
  const FormFieldRow({
    required this.label,
    required this.child,
    this.labelWidth = 84,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    this.height,
    this.showBorder = false,
    this.focusNode,
    this.onTap,
    super.key,
  });

  final String label;
  final Widget child;
  final double labelWidth;
  final EdgeInsetsGeometry padding;
  final double? height;
  final bool showBorder;
  final FocusNode? focusNode;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final node = focusNode;
    final tap = onTap ?? node?.requestFocus;
    if (node == null) return _build(context, focused: false, tap: tap);
    return ListenableBuilder(
      listenable: node,
      builder: (context, _) =>
          _build(context, focused: node.hasFocus, tap: tap),
    );
  }

  Widget _build(
    BuildContext context, {
    required bool focused,
    required VoidCallback? tap,
  }) {
    final palette = context.palette;
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: labelWidth,
          child: Text(
            label,
            style: OewangFonts.sans(color: palette.mutedForeground),
          ),
        ),
        Expanded(child: child),
      ],
    );

    Widget body = height != null
        ? SizedBox(
            height: height,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: row,
            ),
          )
        : Padding(padding: padding, child: row);

    if (showBorder || focusNode != null) {
      body = DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: focused ? palette.foreground : palette.border,
            ),
          ),
        ),
        child: body,
      );
    }

    if (tap != null) {
      body = GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: tap,
        child: body,
      );
    }
    return body;
  }
}
