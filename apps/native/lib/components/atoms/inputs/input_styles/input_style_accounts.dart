import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:oewang/components/atoms/inputs/decorators/input_decorator_account.dart';
import 'package:oewang/components/atoms/inputs/input_style.dart';
import 'package:oewang/components/atoms/inputs/validators/input_validator_required.dart';

/// Account-name field: required, whitespace tidied as you type.
class AccountsInputStyle extends InputStyle {
  const AccountsInputStyle();

  @override
  InputDecoration decoration(BuildContext context) =>
      const InputDecoration(hintText: 'Account Name');

  @override
  List<TextInputFormatter> formatters() => const [AccountFormatter()];

  @override
  FormFieldValidator<String>? validator() => RequiredValidator.validate;
}
