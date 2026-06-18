import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/form_field_row.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A tappable labelled row that displays a [value] (or a muted [placeholder]
/// when empty) and triggers [onTap] — typically to open a drawer / bottom
/// sheet. Reused by the date, category and account selectors.
class SelectField extends StatelessWidget {
  const SelectField({
    required this.label,
    required this.value,
    required this.onTap,
    this.placeholder = '',
    this.labelWidth = 84,
    this.valueColor,
    this.trailing,
    this.height,
    this.showBorder = false,
    super.key,
  });

  final String label;

  /// The selected value's display text. `null` or empty shows [placeholder].
  final String? value;
  final String placeholder;
  final VoidCallback onTap;
  final double labelWidth;

  /// Overrides the value color (used to tint amounts income/expense).
  final Color? valueColor;

  /// Optional widget rendered after the value (e.g. a "Fees" button).
  final Widget? trailing;

  /// Fixed row height + own bottom border (forwarded to [FormFieldRow]).
  final double? height;
  final bool showBorder;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final hasValue = value != null && value!.isNotEmpty;
    final text = hasValue ? value! : placeholder;

    return FormFieldRow(
      label: label,
      labelWidth: labelWidth,
      height: height,
      showBorder: showBorder,
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
                        ? (valueColor ?? palette.foreground)
                        : palette.mutedForeground,
                  ),
                ),
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
