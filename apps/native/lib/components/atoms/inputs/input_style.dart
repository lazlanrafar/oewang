import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:oewang/components/atoms/inputs/input_context.dart';
import 'package:oewang/components/atoms/inputs/input_styles/input_style_accounts.dart';

/// Contract for the *typed* input contexts (text / accounts): formatter,
/// keyboard, validator and a base decoration. The visual [InputVariant] is
/// layered on top by the widget. The drawer contexts (currency / date / select)
/// render rows directly in `Input` and don't use a style.
abstract class InputStyle {
  const InputStyle();

  /// Base decoration (mainly the hint). The variant adds borders/fill.
  InputDecoration decoration(BuildContext context);

  List<TextInputFormatter> formatters() => const [];

  TextInputType keyboardType() => TextInputType.text;

  FormFieldValidator<String>? validator() => null;
}

/// Plain text — no formatter, no validator. The default context.
class TextInputStyle extends InputStyle {
  const TextInputStyle();

  @override
  InputDecoration decoration(BuildContext context) => const InputDecoration();
}

/// Maps a typed context to its style. Add a typed context → add a style; the
/// `Input` widget never changes.
abstract class InputStyleResolver {
  static InputStyle resolve(InputContext context) => switch (context) {
    InputContext.accounts => const AccountsInputStyle(),
    // Non-typed contexts never reach the typed path; default keeps this total.
    _ => const TextInputStyle(),
  };
}
