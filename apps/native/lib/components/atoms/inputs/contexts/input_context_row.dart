import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Shared tappable display row for the `date` and `select` contexts: a labelled
/// row showing [value] (or muted [placeholder] when empty) that runs [onTap].
Widget inputSelectRow(
  BuildContext context,
  Input widget, {
  required String label,
  required String? value,
  required VoidCallback onTap,
  String placeholder = '',
}) {
  final palette = context.palette;
  final hasValue = value != null && value.isNotEmpty;
  final text = hasValue ? value : placeholder;

  return FormFieldRow(
    label: label,
    labelWidth: widget.labelWidth,
    height: widget.height,
    showBorder: widget.showBorder,
    onTap: onTap,
    child: Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                text,
                style: OewangFonts.sans(
                  color: hasValue
                      ? (widget.valueColor ?? palette.foreground)
                      : palette.mutedForeground,
                ),
              ),
            ),
          ),
        ),
        if (widget.trailing != null) widget.trailing!,
      ],
    ),
  );
}
