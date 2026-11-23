// The whole M1 path against a running local stack (MOB-2, MOB-3, MOB-4):
// sign in through /sync, sign up into a workspace-less session, create a
// workspace, then create, edit and delete a transaction. Every call is OWE1
// to the real API.
//
//   docker compose -f infra/docker-compose.yml up        # api on :3002
//   cd apps/native
//   fvm flutter drive -d <simulator> \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/transactions_flow_test.dart \
//     --dart-define-from-file=env/dev.json
//
// Screenshots land in $SCREENSHOT_DIR (default build/integration_screenshots).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/wallet.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  /// Pumps frames until [finder] matches, or fails after [timeout]. Network
  /// screens animate a spinner, so `pumpAndSettle` would never settle.
  Future<void> waitFor(
    WidgetTester tester,
    Finder finder, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (finder.evaluate().isNotEmpty) return;
    }
    fail('timed out waiting for $finder');
  }

  Future<void> shot(WidgetTester tester, String name) async {
    await tester.pump(const Duration(milliseconds: 400));
    await binding.takeScreenshot(name);
  }

  Finder field(int index) => find.byType(TextField).at(index);

  Future<void> keypad(WidgetTester tester, String digits) async {
    for (final d in digits.split('')) {
      await tester.tap(
        find.descendant(of: find.byType(AmountKeypad), matching: find.text(d)),
      );
      await tester.pump();
    }
    await tester.tap(
      find.descendant(of: find.byType(AmountKeypad), matching: find.text('OK')),
    );
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('MOB-3 MOB-4 sign in, sync, create a workspace, and '
      'create, edit and delete a transaction', (tester) async {
    await SecureStorageService().clear();
    final prefs = await PreferencesService.open();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          envProvider.overrideWithValue(EnvConfig.fromDefines()),
          preferencesServiceProvider.overrideWithValue(prefs),
        ],
        child: const OewangApp(),
      ),
    );

    // 1. Sign in as the dev seed user: /sync keeps its workspace.
    await waitFor(tester, find.text('Login'));
    await shot(tester, '01-login');
    await tester.enterText(field(0), 'demo@oewang.local');
    await tester.enterText(field(1), 'oewang-dev-password');
    await tester.pump();
    await tester.tap(find.text('Login'));
    await waitFor(tester, find.text('Trans.'));
    await waitFor(tester, find.byType(TransactionRow));
    await shot(tester, '02-demo-transactions');

    // 2. Sign out from More.
    await tester.tap(find.text('More'));
    await waitFor(tester, find.text('Log out'));
    await tester.scrollUntilVisible(find.text('Log out'), 300);
    await tester.tap(find.text('Log out'));
    await waitFor(tester, find.text('Log out').last);
    await tester.tap(find.text('Log out').last);
    await waitFor(tester, find.text('Login'));

    // 3. Sign up: a session with no workspace, so /sync finds none and the
    // router opens workspace create (D109).
    await tester.tap(find.text('Sign up'));
    await waitFor(tester, find.text('Create account'));
    final stamp = DateTime.now().millisecondsSinceEpoch;
    await tester.enterText(field(0), 'Mobile Test');
    await tester.enterText(field(1), 'mobile-$stamp@oewang.local');
    await tester.enterText(field(2), 'mobile-test-password-1');
    await tester.enterText(field(3), 'mobile-test-password-1');
    await tester.pump();
    await tester.tap(find.text('Create account'));
    await waitFor(tester, find.text('Create workspace'));
    await tester.enterText(field(0), 'Mobile $stamp');
    await tester.pump();
    await shot(tester, '03-create-workspace');
    await tester.tap(find.text('Continue'));
    await waitFor(tester, find.text('Trans.'));
    await waitFor(tester, find.text('No transactions this month'));
    await shot(tester, '04-new-workspace-empty');

    // 4. Create: FAB, keypad, then the category and account pickers that
    // open in turn. Names come from the new workspace's own seed.
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    final categories = await container
        .read(categoriesRepositoryProvider)
        .list(type: CategoryType.expense);
    final category =
        (categories as Success<List<Category>, AppError>).value.first;
    final wallets = await container.read(walletsRepositoryProvider).list();
    final walletName =
        (wallets as Success<List<Wallet>, AppError>).value.first.name;

    await tester.tap(find.byIcon(Icons.add));
    await waitFor(tester, find.byType(AmountKeypad));
    await keypad(tester, '25000');
    await waitFor(tester, find.text(category.name));
    await tester.tap(find.text(category.name).last);
    await tester.pump(const Duration(milliseconds: 500));
    await waitFor(tester, find.text(walletName));
    await tester.tap(find.text(walletName).last);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(field(0), 'Nasi goreng');
    await tester.pump();
    await shot(tester, '05-form-create');
    await tester.tap(find.text('Save'));
    await waitFor(tester, find.text('Nasi goreng'));
    await shot(tester, '06-created');

    // 5. Edit: append a zero to the amount, 25.000 -> 250.000.
    await tester.tap(find.text('Nasi goreng'));
    await waitFor(tester, find.textContaining('25.000'));
    await tester.tap(find.textContaining('25.000'));
    await waitFor(tester, find.byType(AmountKeypad));
    await keypad(tester, '0');
    await shot(tester, '07-form-edit');
    await tester.tap(find.text('Save'));
    await waitFor(tester, find.textContaining('250.000'));
    await shot(tester, '08-edited');

    // 6. Delete from the edit form.
    await tester.tap(find.text('Nasi goreng'));
    await waitFor(tester, find.byTooltip('Delete'));
    await tester.tap(find.byTooltip('Delete'));
    await waitFor(tester, find.text('Delete transaction?'));
    await tester.tap(find.text('Delete').last);
    await waitFor(tester, find.text('No transactions this month'));
    await shot(tester, '09-deleted');
  });
}
