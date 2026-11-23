import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/domain/models/money.dart';

Decimal d(String v) => Decimal.parse(v);

void main() {
  group('MOB-4 AmountFormat on Decimal', () {
    test('groups thousands and drops trailing zeros while typing', () {
      expect(AmountFormat.number(d('1000000')), '1.000.000');
      expect(AmountFormat.number(d('1000.5')), '1.000,5');
      expect(AmountFormat.number(d('50000.0000')), '50.000');
      expect(AmountFormat.number(Decimal.zero), '0');
    });

    test('forces decimals when asked, rounding half away from zero', () {
      expect(AmountFormat.number(d('1.005'), decimals: 2), '1,01');
      expect(AmountFormat.number(d('-1.005'), decimals: 2), '-1,01');
      expect(AmountFormat.number(d('999.999'), decimals: 0), '1.000');
    });

    test('keeps digits a double would lose', () {
      expect(
        AmountFormat.number(d('12345678901234567.89'), decimals: 2),
        '12.345.678.901.234.567,89',
      );
    });

    test('currency puts the symbol or code in front', () {
      expect(AmountFormat.currency(d('1000')), 'Rp 1.000');
      expect(
        AmountFormat.currency(d('1000'), currency: 'USD', useCode: true),
        'USD 1.000',
      );
    });

    test('Money.format keeps the old look, sign before the symbol', () {
      expect(Money(amount: d('1952500')).format(), 'Rp 1.952.500,00');
      expect(Money(amount: d('-1000')).format(), '-Rp 1.000,00');
      expect(Money(amount: d('2.5'), currency: 'USD').format(), r'US$ 2,50');
    });
  });
}
