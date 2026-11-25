import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/core/theme/app_theme.dart';

/// Types [keys] on the keypad, presses OK and returns what it submitted.
Future<Decimal?> _enter(WidgetTester tester, List<String> keys) async {
  Decimal? submitted;
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: AmountKeypad(onSubmit: (v) => submitted = v)),
      ),
    ),
  );
  for (final k in [...keys, 'OK']) {
    await tester.tap(find.text(k));
    await tester.pump();
  }
  return submitted;
}

void main() {
  group('OEW-121 AmountKeypad chains operators', () {
    testWidgets('10000 + 5000 + 2000 is 17000', (tester) async {
      final v = await _enter(tester, [
        '1', '000', '0', '+', '5', '000', '+', '2', '000', //
      ]);
      expect(v, Decimal.fromInt(17000));
    });

    testWidgets('100 × 3 + 50 is 350', (tester) async {
      final v = await _enter(tester, ['1', '00', '×', '3', '+', '5', '0']);
      expect(v, Decimal.fromInt(350));
    });

    testWidgets('a second operator in a row replaces the first', (
      tester,
    ) async {
      final v = await _enter(tester, ['8', '+', '-', '3']);
      expect(v, Decimal.fromInt(5));
    });
  });
}
