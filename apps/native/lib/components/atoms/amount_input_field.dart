import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/form_field_row.dart';
import 'package:oewang/components/molecules/form_drawer.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// A labelled amount row. Renders [value] with live thousands grouping
/// ("Rp 1.000.000") and opens the amount keypad on tap. The keypad pushes every
/// keystroke back through [onChanged] so the number updates here in real time,
/// and the Rp / S$ / US$ tabs switch the displayed currency. When wrapped in a
/// [FormDrawerHost] the keypad shows in the shared bottom panel; otherwise it
/// falls back to a modal sheet.
class AmountInputField extends StatefulWidget {
  const AmountInputField({
    required this.value,
    required this.onChanged,
    this.label = 'Amount',
    this.drawerId,
    this.currency = 'IDR',
    this.onCurrencyChanged,
    this.valueColor,
    this.labelWidth = 84,
    this.trailing,
    super.key,
  });

  final num value;
  final ValueChanged<num> onChanged;
  final String label;

  /// Unique drawer id within the form. Defaults to [label].
  final String? drawerId;

  /// Initial currency code (IDR / SGD / USD).
  final String currency;

  /// Reports a currency switch made via the keypad tabs.
  final ValueChanged<String>? onCurrencyChanged;

  final Color? valueColor;
  final double labelWidth;

  /// Optional widget after the amount (e.g. the transfer "Fees" button).
  final Widget? trailing;

  @override
  State<AmountInputField> createState() => _AmountInputFieldState();
}

class _AmountInputFieldState extends State<AmountInputField> {
  late String _currency = widget.currency;

  @override
  void didUpdateWidget(AmountInputField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currency != widget.currency) _currency = widget.currency;
  }

  void _onCurrencyChanged(String code) {
    setState(() => _currency = code);
    widget.onCurrencyChanged?.call(code);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return FormFieldRow(
      label: widget.label,
      labelWidth: widget.labelWidth,
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => openAmountDrawer(
                context,
                id: widget.drawerId ?? widget.label,
                initial: widget.value,
                title: widget.label,
                currency: _currency,
                onChanged: widget.onChanged,
                onCurrencyChanged: _onCurrencyChanged,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(
                  AmountFormat.currency(widget.value, currency: _currency),
                  style: OewangFonts.currency(
                    color: widget.valueColor ?? palette.foreground,
                    fontSize: 16,
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
}
