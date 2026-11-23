import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/layouts/bottom_nav.dart';
import 'package:oewang/core/theme/app_theme.dart';

void main() {
  testWidgets('Bottom nav renders all four tabs', (tester) async {
    var selected = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          bottomNavigationBar: OewangBottomNav(
            currentIndex: 0,
            onSelect: (i) => selected = i,
            month: DateTime(2026, 1, 5),
          ),
        ),
      ),
    );

    expect(find.text('01/2026'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
    expect(find.text('Accounts'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);

    await tester.tap(find.text('Stats'));
    expect(selected, 1);
  });
}
