import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Shared layout for the `currency`, `date` and `select` contexts. Renders the
/// already-styled [value] widget plus any `widget.trailing`, laid out by
/// `widget.labelPosition`. The `variant` border is drawn around the value/input
/// area (not the label) in both layouts — use `InputVariant.none` for the plain
/// WMoney row look.
///
/// - `left` — two-column row (muted label left, value right).
/// - `top` — the label stacked above the bordered field.
Widget inputFieldLayout(
  BuildContext context,
  Input widget, {
  required String label,
  required Widget value,
  required VoidCallback onTap,
}) {
  final palette = context.palette;
  final content = Row(
    children: [
      Expanded(child: value),
      if (widget.trailing != null) widget.trailing!,
    ],
  );

  // The value/input area, decorated by `variant` (border only on this area, not
  // the label) and turning foreground-bordered while its own drawer is open.
  final id = widget.drawerId ?? label;
  final controller = FormDrawerScope.maybeOf(context);
  Widget box({required bool focused}) => DecoratedBox(
    decoration: _variantDecoration(widget.variant, palette, focused: focused),
    child: Padding(padding: _variantPadding(widget.variant), child: content),
  );
  final fieldBox = controller == null
      ? box(focused: false)
      : ListenableBuilder(
          listenable: controller,
          builder: (_, _) => box(focused: controller.activeId == id),
        );
  final field = GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTap: onTap,
    child: fieldBox,
  );

  if (widget.labelPosition == InputLabelPosition.top) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: OewangFonts.sans(
                color: palette.foreground,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 6),
            field,
          ],
        ),
      ),
    );
  }

  return FormFieldRow(
    label: label,
    labelWidth: widget.labelWidth,
    height: widget.height,
    showBorder: widget.showBorder,
    onTap: onTap,
    child: field,
  );
}

/// Convenience over [inputFieldLayout] for text values: shows [value] (or muted
/// [placeholder] when empty), tinted by `widget.valueColor`.
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

  return inputFieldLayout(
    context,
    widget,
    label: label,
    onTap: onTap,
    value: Text(
      text,
      style: OewangFonts.sans(
        color: hasValue
            ? (widget.valueColor ?? palette.foreground)
            : palette.mutedForeground,
      ),
    ),
  );
}

EdgeInsets _variantPadding(InputVariant variant) => switch (variant) {
  InputVariant.none => const EdgeInsets.symmetric(vertical: 2),
  InputVariant.underline => const EdgeInsets.symmetric(vertical: 8),
  InputVariant.outlined ||
  InputVariant.filled => const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
};

BoxDecoration _variantDecoration(
  InputVariant variant,
  OewangPalette palette, {
  required bool focused,
}) {
  final color = focused ? palette.foreground : palette.border;
  return switch (variant) {
    InputVariant.none => const BoxDecoration(),
    InputVariant.underline => BoxDecoration(
      border: Border(bottom: BorderSide(color: color)),
    ),
    InputVariant.outlined => BoxDecoration(border: Border.all(color: color)),
    InputVariant.filled => BoxDecoration(color: palette.muted),
  };
}
