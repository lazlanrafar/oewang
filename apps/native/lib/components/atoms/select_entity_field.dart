import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/select_field.dart';
import 'package:oewang/components/molecules/form_drawer.dart';

/// A labelled row that opens a picker to choose one item of type [T] from
/// [items], then reports it through [onSelected]. Drives the Category, Account
/// and Group rows.
///
/// When [gridColumns] is set the picker is a WMoney-style grid (with optional
/// [leadingOf] emoji); otherwise it's a vertical list. Inside a [FormDrawerHost]
/// the picker appears in the shared bottom panel; otherwise it's a modal sheet.
class SelectEntityField<T> extends StatelessWidget {
  const SelectEntityField({
    required this.label,
    required this.value,
    required this.items,
    required this.labelOf,
    required this.idOf,
    required this.onSelected,
    this.drawerId,
    this.sheetTitle,
    this.placeholder = 'Choose…',
    this.subtitleOf,
    this.leadingOf,
    this.gridColumns,
    this.labelWidth = 84,
    super.key,
  });

  final String label;

  /// The currently selected item, or `null` when nothing is chosen.
  final T? value;
  final List<T> items;
  final String Function(T) labelOf;
  final String Function(T) idOf;
  final ValueChanged<T> onSelected;

  /// Unique drawer id within the form. Defaults to [label].
  final String? drawerId;

  /// Sheet header text. Defaults to [label].
  final String? sheetTitle;
  final String placeholder;

  /// Subtitle (list layout only).
  final String? Function(T)? subtitleOf;

  /// Leading glyph per item (grid layout only), e.g. a category emoji.
  final String? Function(T)? leadingOf;

  /// When non-null the picker renders as a grid with this many columns.
  final int? gridColumns;
  final double labelWidth;

  String _displayLabel() {
    final v = value;
    if (v == null) return '';
    final leading = leadingOf?.call(v);
    final name = labelOf(v);
    return (leading != null && leading.isNotEmpty) ? '$leading $name' : name;
  }

  @override
  Widget build(BuildContext context) {
    return SelectField(
      label: label,
      labelWidth: labelWidth,
      value: _displayLabel(),
      placeholder: placeholder,
      onTap: () {
        final id = drawerId ?? label;
        final title = sheetTitle ?? label;
        final selectedId = value == null ? null : idOf(value as T);
        if (gridColumns != null) {
          openGridDrawer<T>(
            context,
            id: id,
            title: title,
            items: items,
            labelOf: labelOf,
            leadingOf: leadingOf,
            idOf: idOf,
            selectedId: selectedId,
            columns: gridColumns!,
            onSelected: onSelected,
          );
        } else {
          openListDrawer<T>(
            context,
            id: id,
            title: title,
            items: items,
            labelOf: labelOf,
            idOf: idOf,
            subtitleOf: subtitleOf,
            onSelected: onSelected,
          );
        }
      },
    );
  }
}
