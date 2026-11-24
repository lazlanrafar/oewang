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

import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_screen.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
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
      if (finder.evaluate().isNotEmpty) {
        // A page that has just appeared is still sliding in, and a tap during
        // the transition lands nowhere. Let it finish.
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    fail('timed out waiting for $finder');
  }

  var surfaceIsImage = false;
  Future<void> shot(WidgetTester tester, String name) async {
    // Android draws to a surface the binding cannot read back until it is
    // swapped for an image, once; iOS needs no swap.
    if (Platform.isAndroid && !surfaceIsImage) {
      await binding.convertFlutterSurfaceToImage();
      surfaceIsImage = true;
    }
    await tester.pump(const Duration(milliseconds: 400));
    await binding.takeScreenshot(name);
  }

  Finder field(int index) => find.byType(TextField).at(index);

  /// Closes the keyboard and taps a button by its label. The keyboard pushes
  /// buttons below the fold, and a screen left underneath in the route stack
  /// can hold a second widget with the same label.
  Future<void> press(WidgetTester tester, String label) async {
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.ensureVisible(find.text(label).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(label).last);
  }

  /// Saves the transaction form and waits for it to close: the form shows the
  /// same note and figure as the list behind it.
  Future<void> saveForm(WidgetTester tester) async {
    await press(tester, 'Save');
    for (var i = 0; i < 100; i++) {
      if (find.byType(TransactionFormScreen).evaluate().isEmpty) return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('the transaction form did not close after Save');
  }

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
    // main() does this before the app starts; push needs it (PUSH-1).
    await Firebase.initializeApp();
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
    // The list builds lazily and Log out sits below the fold, so wait for the
    // screen, then scroll to it.
    final settingsList = find.descendant(
      of: find.byType(SettingsScreen),
      matching: find.byType(Scrollable),
    );
    await waitFor(tester, settingsList);
    await tester.scrollUntilVisible(
      find.text('Log out'),
      300,
      scrollable: settingsList.first,
    );
    // Built is not shown: the row can sit in the list's cache area, just
    // below its edge, on a screen of another height.
    await tester.ensureVisible(find.text('Log out'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Log out'));
    await waitFor(tester, find.text('Log out').last);
    await tester.tap(find.text('Log out').last);
    await waitFor(tester, find.text('Login'));

    // 3. Sign up: a session with no workspace, so /sync finds none and the
    // router opens workspace create (D109).
    await tester.tap(find.text('Sign up'));
    await waitFor(tester, find.text('Create account'));
    final stamp = DateTime.now().millisecondsSinceEpoch;
    // The login screen stays mounted under the pushed register screen, so
    // count fields inside the register screen only.
    Finder signUpField(int i) => find
        .descendant(
          of: find.byType(RegisterScreen),
          matching: find.byType(TextField),
        )
        .at(i);
    await tester.enterText(signUpField(0), 'Mobile Test');
    await tester.enterText(signUpField(1), 'mobile-$stamp@oewang.local');
    await tester.enterText(signUpField(2), 'mobile-test-password-1');
    await tester.enterText(signUpField(3), 'mobile-test-password-1');
    await tester.pump();
    // The keyboard pushes the button below the fold; a tap there hits nothing.
    await tester.ensureVisible(find.text('Create account').last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Create account').last);
    await waitFor(tester, find.text('Create workspace'));
    await tester.enterText(
      find
          .descendant(
            of: find.byType(OnboardingScreen),
            matching: find.byType(TextField),
          )
          .first,
      'Mobile $stamp',
    );
    await tester.pump();
    await tester.ensureVisible(find.text('Continue').last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Continue').last);
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
    await tester.enterText(
      find
          .descendant(
            of: find.byType(TransactionFormScreen),
            matching: find.byType(TextField),
          )
          .first,
      'Nasi goreng',
    );
    await tester.pump();
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await shot(tester, '05-form-create');
    await saveForm(tester);
    await waitFor(tester, find.text('Nasi goreng'));
    await shot(tester, '06-created');

    // 5. Edit: append a zero to the amount, 25.000 -> 250.000.
    await tester.tap(find.text('Nasi goreng'));
    final formAmount = find.descendant(
      of: find.byType(TransactionFormScreen),
      matching: find.textContaining('25.000'),
    );
    await waitFor(tester, formAmount);
    await tester.tap(formAmount.first);
    await waitFor(tester, find.byType(AmountKeypad));
    await keypad(tester, '0');
    await shot(tester, '07-form-edit');
    await saveForm(tester);
    await waitFor(tester, find.textContaining('250.000'));
    await shot(tester, '08-edited');

    // 6. Delete from the edit form.
    await tester.tap(find.text('Nasi goreng'));
    await waitFor(tester, find.byTooltip('Delete'));
    // Let the form's route finish sliding in; a tap mid-transition misses.
    await tester.pump(const Duration(milliseconds: 600));
    await tester.tap(find.byTooltip('Delete').last);
    await waitFor(tester, find.text('Delete transaction?'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Delete').last);
    await waitFor(tester, find.text('No transactions this month'));
    await shot(tester, '09-deleted');
  });
}
