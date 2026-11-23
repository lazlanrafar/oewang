import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/router/push_route.dart';

void main() {
  group('PUSH-1 a tapped push opens the screen its route names', () {
    test('a finished receipt opens its transaction', () {
      expect(
        pushLocation('/transactions?detail=txn_123'),
        '${AppRoutes.trans}?detail=txn_123',
      );
    });

    test('a failed receipt opens its vault file', () {
      expect(pushLocation('/vault?file=vf_9'), '/vault?file=vf_9');
    });

    test('an import job opens the transactions', () {
      expect(pushLocation('/transactions'), AppRoutes.trans);
    });

    test('a budget alert opens budgets on its month', () {
      expect(
        pushLocation('/budgets?month=2026-11'),
        '${AppRoutes.budgetSettings}?month=2026-11',
      );
    });

    test('an invitation opens the workspace list on More', () {
      expect(pushLocation('/workspaces'), AppRoutes.more);
    });

    test('an unknown, missing or foreign route opens home', () {
      for (final route in [
        null,
        42,
        '',
        '/settings/feedback',
        'https://evil.example/transactions',
        '//evil.example/transactions',
      ]) {
        expect(pushLocation(route), AppRoutes.trans, reason: '$route');
      }
    });

    test('a malformed parameter is dropped, not passed on', () {
      expect(pushLocation('/transactions?detail=../../x'), AppRoutes.trans);
      expect(pushLocation('/budgets?month=2026-13'), AppRoutes.budgetSettings);
      expect(pushLocation('/vault?file=a%20b'), '/vault');
    });
  });
}
