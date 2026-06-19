import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/extensions/input_decoration_extension.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/atoms/inputs/input_style.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// `InputContext.text` / `InputContext.accounts` — a typed [TextFormField]
/// styled by the resolved [InputStyle] and the [InputVariant] border. The
/// password reveal toggle ([obscured] / [onToggleObscure]) and [controller] are
/// owned by the `Input` state.
Widget buildTextContext(
  BuildContext context,
  Input widget, {
  required TextEditingController controller,
  required bool obscured,
  required VoidCallback onToggleObscure,
}) {
  final palette = context.palette;
  final style = InputStyleResolver.resolve(widget.context);

  final Widget? suffixIcon = widget.obscureText
      ? IconButton(
          tooltip: obscured ? 'Show password' : 'Hide password',
          onPressed: onToggleObscure,
          icon: Icon(
            obscured ? Icons.visibility_off : Icons.visibility,
            size: 18,
            color: palette.mutedForeground.withValues(alpha: 0.6),
          ),
        )
      : null;

  var base = style.decoration(context);
  if (widget.hintText != null) base = base.copyWith(hintText: widget.hintText);

  final multiline = widget.maxLines != 1;
  final field = TextFormField(
    controller: controller,
    autofocus: widget.autofocus,
    obscureText: obscured,
    maxLines: obscured ? 1 : widget.maxLines,
    minLines: widget.minLines,
    keyboardType: widget.keyboardType ??
        (multiline ? TextInputType.multiline : style.keyboardType()),
    inputFormatters: style.formatters(),
    validator: style.validator(),
    autofillHints: widget.autofillHints,
    onTap: widget.onTap,
    onChanged: widget.onChanged,
    onFieldSubmitted: widget.onSubmitted,
    style: OewangFonts.sans(color: palette.foreground, fontSize: 14),
    decoration: base.withVariant(widget.variant, palette, suffixIcon: suffixIcon),
  );

  if (widget.label == null) return field;
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        widget.label!,
        style: OewangFonts.sans(
          color: palette.foreground,
          fontSize: 13,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 6),
      field,
    ],
  );
}
