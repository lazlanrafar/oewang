import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/atoms/inputs/decorators/input_decorator_account.dart';
import 'package:oewang/components/atoms/inputs/input_context.dart';
import 'package:oewang/components/atoms/inputs/input_style.dart';
import 'package:oewang/components/atoms/inputs/input_styles/input_style_accounts.dart';
import 'package:oewang/components/atoms/inputs/validators/input_validator_required.dart';

TextEditingValue _v(String t) => TextEditingValue(text: t);

void main() {
  test('AccountFormatter collapses whitespace and trims leading space', () {
    const f = AccountFormatter();
    expect(f.formatEditUpdate(_v(''), _v('  My   Cash')).text, 'My Cash');
  });

  test('RequiredValidator fails on blank, passes on text', () {
    expect(RequiredValidator.validate('  '), isNotNull);
    expect(RequiredValidator.validate('Cash'), isNull);
  });

  test('resolver maps the typed contexts to a style', () {
    expect(InputStyleResolver.resolve(InputContext.text), isA<TextInputStyle>());
    expect(
      InputStyleResolver.resolve(InputContext.accounts),
      isA<AccountsInputStyle>(),
    );
  });
}
