/// Fails when the field is empty (after trimming). Used by text/account fields.
abstract class RequiredValidator {
  static String? validate(String? value, {String message = 'Required'}) {
    if (value == null || value.trim().isEmpty) return message;
    return null;
  }
}
