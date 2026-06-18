import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/select_field.dart';
import 'package:oewang/components/molecules/form_drawer.dart';

/// A labelled row that shows a formatted [value] date and opens the WMoney-style
/// calendar drawer on tap, reporting the chosen day through [onChanged]. Inside
/// a [FormDrawerHost] the calendar appears in the shared bottom panel; otherwise
/// it's a modal sheet.
class SelectDateField extends StatelessWidget {
  const SelectDateField({
    required this.value,
    required this.onChanged,
    this.label = 'Date',
    this.drawerId,
    this.pattern = 'EEE, dd/MM/yyyy',
    this.firstDate,
    this.lastDate,
    this.labelWidth = 84,
    super.key,
  });

  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  final String label;

  /// Unique drawer id within the form. Defaults to [label].
  final String? drawerId;
  final String pattern;
  final DateTime? firstDate;
  final DateTime? lastDate;
  final double labelWidth;

  @override
  Widget build(BuildContext context) {
    return SelectField(
      label: label,
      labelWidth: labelWidth,
      value: DateFormat(pattern).format(value),
      onTap: () => openDateDrawer(
        context,
        id: drawerId ?? label,
        initial: value,
        firstDate: firstDate,
        lastDate: lastDate,
        onSelected: onChanged,
      ),
    );
  }
}
