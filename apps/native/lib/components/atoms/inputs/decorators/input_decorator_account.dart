import 'package:flutter/services.dart';

/// Tidies account-name input: no leading space, and runs of whitespace collapse
/// to a single space so names stay clean as they're typed.
class AccountFormatter extends TextInputFormatter {
  const AccountFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final cleaned = newValue.text
        .replaceAll(RegExp(r'\s+'), ' ')
        .replaceAll(RegExp(r'^\s'), '');
    if (cleaned == newValue.text) return newValue;
    return TextEditingValue(
      text: cleaned,
      selection: TextSelection.collapsed(offset: cleaned.length),
    );
  }
}
