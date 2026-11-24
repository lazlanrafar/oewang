import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/core/theme/app_theme.dart';

/// A form route over a home, with a field that opens the drawer.
Future<void> _pumpForm(WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => Scaffold(
                body: FormDrawerHost(
                  child: Builder(
                    builder: (context) => TextButton(
                      onPressed: () => FormDrawerScope.maybeOf(
                        context,
                      )!.open('Amount', (_) => const Text('keypad')),
                      child: const Text('form'),
                    ),
                  ),
                ),
              ),
            ),
          ),
          child: const Text('home'),
        ),
      ),
    ),
  );
  await tester.tap(find.text('home'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('form'));
  await tester.pumpAndSettle();
  expect(find.text('keypad'), findsOneWidget);
}

void main() {
  testWidgets('OEW-083 Android back closes the open panel, then the form', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try {
      await _pumpForm(tester);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('keypad'), findsNothing);
      expect(find.text('form'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('form'), findsNothing);
      expect(find.text('home'), findsOneWidget);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('iOS back still leaves the form with the panel open', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      await _pumpForm(tester);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('form'), findsNothing);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });
}
