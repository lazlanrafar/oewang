import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/ui/shell/smoke_screen.dart';

void main() {
  testWidgets('Smoke screen renders the design tokens header', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: SmokeScreen()));
    expect(find.text('Design tokens — dark theme'), findsOneWidget);
    expect(find.text('Typography'), findsOneWidget);
  });
}
