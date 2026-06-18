import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A labelled form row — a fixed-width muted label on the left and an arbitrary
/// [child] on the right. Shared by every row in the transaction / account forms
/// so spacing and label styling stay consistent.
class FormFieldRow extends StatelessWidget {
  const FormFieldRow({
    required this.label,
    required this.child,
    this.labelWidth = 84,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    super.key,
  });

  final String label;
  final Widget child;
  final double labelWidth;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: labelWidth,
            child: Text(
              label,
              style: OewangFonts.sans(color: context.palette.mutedForeground),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}
