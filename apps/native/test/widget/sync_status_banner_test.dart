import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/molecules/sync_status_banner.dart';
import 'package:oewang/config/dependencies.dart';

void main() {
  testWidgets('should hide sync status when there are no pending writes', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          pendingSyncCountProvider.overrideWith((_) => Stream.value(0)),
          syncIssuesProvider.overrideWith((_) => Stream.value([])),
        ],
        child: const MaterialApp(home: Scaffold(body: SyncStatusBanner())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ListTile), findsNothing);
  });
  testWidgets(
    'should show pending count and identify failed rows when sync fails',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            pendingSyncCountProvider.overrideWith((_) => Stream.value(2)),
            syncIssuesProvider.overrideWith(
              (_) => Stream.value([('Cash', 'Account is required')]),
            ),
          ],
          child: const MaterialApp(home: Scaffold(body: SyncStatusBanner())),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('2 changes waiting to sync'), findsOneWidget);
      await tester.tap(find.byType(ExpansionTile));
      await tester.pumpAndSettle();
      expect(find.text('Cash'), findsOneWidget);
      expect(find.text('Account is required'), findsOneWidget);
    },
  );
}
