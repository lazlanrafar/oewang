// The M2 screens against a running local stack (MOB-4, MOB-5): accounts and
// their opening balance, account groups, include-in-totals, categories,
// budgets, stats and settings, then the read-only role. Every call is OWE1 to
// the real API.
//
//   docker compose -f infra/docker-compose.yml up        # api on :3002
//   cd apps/native
//   flutter drive -d <simulator> \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/m2_screens_flow_test.dart \
//     --dart-define-from-file=env/dev.json \
//     --dart-define=M2_EMAIL=<owner> --dart-define=M2_PASSWORD=<pw> \
//     --dart-define=M2_VIEWER_EMAIL=<viewer> \
//     --dart-define=M2_VIEWER_PASSWORD=<pw> \
//     --dart-define=M2_SIGNUP=true --dart-define=M2_VIEWER_SIGNUP=true
//
// The two SIGNUP flags are for the first run only: register is rate limited,
// so later runs sign in with the same users. Each run names what it makes
// with a fresh stamp, so reruns never collide.
//
// Evidence: at each `snap` the test writes /tmp/oew-m2/req-<name> and holds
// the screen; a host loop answers with `xcrun simctl io <udid> screenshot`.
// On Android, where that path is not the host's, it prints `M2SHOT <name>`
// instead. `binding.takeScreenshot` goes blank once the keyboard has opened.

import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/layouts/bottom_nav.dart';
import 'package:oewang/components/molecules/swipe_action_row.dart';
import 'package:oewang/components/organisms/auth/auth_login_screen.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_screen.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/budgets/budgets_form_screen.dart';
import 'package:oewang/components/organisms/budgets/budgets_setting_screen.dart';
import 'package:oewang/components/organisms/categories/categories_form_screen.dart';
import 'package:oewang/components/organisms/categories/categories_list_screen.dart';
import 'package:oewang/components/organisms/settings/feedback/feedback_form_screen.dart';
import 'package:oewang/components/organisms/settings/members/settings_members_screen.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/settings/style/settings_style_screen.dart';
import 'package:oewang/components/organisms/stats/stats_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_include_in_totals_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/money.dart';

const _email = String.fromEnvironment('M2_EMAIL');
const _password = String.fromEnvironment('M2_PASSWORD');
const _viewerEmail = String.fromEnvironment('M2_VIEWER_EMAIL');
const _viewerPassword = String.fromEnvironment('M2_VIEWER_PASSWORD');
const _signUp = bool.fromEnvironment('M2_SIGNUP');
const _viewerSignUp = bool.fromEnvironment('M2_VIEWER_SIGNUP');

/// Push is not this flow's subject, and its permission prompt is a system
/// alert that outlives the app and blanks every simulator screenshot.
class _NoPush implements PushMessaging {
  @override
  String get platform => 'ios';
  @override
  Future<bool> requestPermission() async => false;
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get tokenRefresh => const Stream.empty();
  @override
  Stream<String?> get tapped => const Stream.empty();
  @override
  Future<String?> launchedFrom() async => null;
}

T _ok<T>(Result<T, AppError> r) => switch (r) {
  Success(:final value) => value,
  Failure(:final error) => throw StateError('API call failed: $error'),
};

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

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

  Future<void> waitGone(WidgetTester tester, Finder finder) async {
    for (var i = 0; i < 100; i++) {
      if (finder.evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 400));
        return;
      }
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('still showing: $finder');
  }

  /// Asks the host loop for a simulator screenshot and holds the screen
  /// until it is taken (or 5 s pass, when no loop runs).
  Future<void> snap(WidgetTester tester, String name) async {
    await tester.pump(const Duration(milliseconds: 400));
    final req = File('/tmp/oew-m2/req-$name');
    try {
      req.writeAsStringSync(name);
    } on FileSystemException {
      // An emulator's /tmp is not the host's: ask through the run's output
      // instead (`adb exec-out screencap` on the line).
      debugPrint('M2SHOT $name');
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
      return;
    }
    for (var i = 0; i < 25 && req.existsSync(); i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  Finder inScreen(Type screen, Finder matching) =>
      find.descendant(of: find.byType(screen), matching: matching);

  /// Waits for [target] inside [screen], scrolling the screen's list down
  /// when it is not built yet: new rows are appended at the end.
  Future<void> reveal(WidgetTester tester, Type screen, Finder target) async {
    final end = DateTime.now().add(const Duration(seconds: 20));
    // Down first, then up: a list left scrolled holds earlier rows above.
    var delta = 250.0;
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 300));
      final scrollable = inScreen(screen, find.byType(Scrollable));
      if (target.evaluate().isEmpty && scrollable.evaluate().isNotEmpty) {
        delta = -delta;
        try {
          await tester.scrollUntilVisible(
            target,
            -delta,
            scrollable: scrollable.first,
            maxScrolls: 40,
          );
        } on Object {
          continue; // not loaded yet; the list may still grow
        }
      }
      if (target.evaluate().isNotEmpty) {
        await tester.ensureVisible(target.first);
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    fail('timed out revealing $target in $screen');
  }

  /// Closes the keyboard and taps a button by its label. The keyboard pushes
  /// buttons below the fold, and a screen left underneath in the route stack
  /// can hold a second widget with the same label.
  Future<void> press(WidgetTester tester, Finder button) async {
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.ensureVisible(button.last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(button.last);
  }

  /// Taps a button without closing the keyboard first: on the auth forms
  /// the keyboard's done action submits.
  Future<void> tapLast(WidgetTester tester, Finder button) async {
    await tester.ensureVisible(button.last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(button.last);
  }

  /// Taps Save on [screen] and waits for it to close: forms show the same
  /// names as the lists behind them.
  Future<void> saveAndClose(WidgetTester tester, Type screen) async {
    await press(tester, inScreen(screen, find.text('Save')));
    await waitGone(tester, find.byType(screen));
  }

  Future<void> keypad(WidgetTester tester, String digits) async {
    await waitFor(tester, find.byType(AmountKeypad));
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

  /// Taps the value area of a labelled form row (right of its label).
  Future<void> tapRow(WidgetTester tester, Type screen, String label) async {
    final l = inScreen(screen, find.text(label)).first;
    await tester.ensureVisible(l);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tapAt(tester.getCenter(l) + const Offset(160, 0));
    await tester.pump(const Duration(milliseconds: 500));
  }

  Future<void> tab(WidgetTester tester, String label) async {
    await tester.tap(
      find.descendant(
        of: find.byType(OewangBottomNav),
        // The first tab is labelled with the month, so it goes by its icon.
        matching: label == 'Trans'
            ? find.byIcon(Icons.menu_book_outlined)
            : find.text(label),
      ),
    );
    await tester.pump(const Duration(milliseconds: 600));
  }

  Future<void> back(WidgetTester tester, String backLabel) async {
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byTooltip(backLabel).last);
    await tester.pump(const Duration(milliseconds: 700));
  }

  /// Opens a row of the More tab, which is lazily built below the fold.
  Future<void> openMore(WidgetTester tester, String title) async {
    await tab(tester, 'More');
    final row = inScreen(SettingsScreen, find.text(title));
    await reveal(tester, SettingsScreen, row);
    await tester.tap(row.first);
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// The row action (`Edit`, `Delete`) of the settings-list row titled [title].
  Finder rowAction(String title, String tooltip) => find.descendant(
    of: find.ancestor(
      of: find.text(title),
      matching: find.byType(SwipeActionRow),
    ),
    matching: find.byTooltip(tooltip),
  );

  Future<void> typeInto(WidgetTester tester, Finder field, String text) async {
    await tester.enterText(field, text);
    await tester.pump();
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> login(WidgetTester tester, String email, String password) async {
    await waitFor(tester, find.text('Login'));
    final fields = inScreen(LoginScreen, find.byType(TextField));
    await tester.enterText(fields.at(0), email);
    await tester.enterText(fields.at(1), password);
    await tester.pump();
    await tapLast(tester, find.text('Login'));
  }

  Future<void> signUp(
    WidgetTester tester,
    String name,
    String email,
    String password,
  ) async {
    await waitFor(tester, find.text('Login'));
    await tester.tap(find.text('Sign up'));
    await waitFor(tester, find.text('Create account'));
    Finder f(int i) => inScreen(RegisterScreen, find.byType(TextField)).at(i);
    await tester.enterText(f(0), name);
    await tester.enterText(f(1), email);
    await tester.enterText(f(2), password);
    await tester.enterText(f(3), password);
    await tester.pump();
    // The keyboard's done on the last field submits; the button sits under
    // the keyboard, where a tap lands nowhere.
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(seconds: 1));
  }

  /// Signed in with no workspace, the router opens workspace create (D109).
  Future<void> enterWorkspace(WidgetTester tester) async {
    final home = find.text('Trans.');
    final create = find.text('Create workspace');
    for (var i = 0; i < 100; i++) {
      await tester.pump(const Duration(milliseconds: 200));
      if (home.evaluate().isNotEmpty) break;
      if (create.evaluate().isNotEmpty) {
        await tester.pump(const Duration(milliseconds: 600));
        await tester.enterText(
          inScreen(OnboardingScreen, find.byType(TextField)).first,
          'M2 Workspace',
        );
        await tester.pump();
        await tapLast(tester, find.text('Continue'));
        break;
      }
    }
    await waitFor(tester, home);
  }

  Future<void> logout(WidgetTester tester) async {
    await openMore(tester, 'Log out');
    await waitFor(tester, find.text('Log out').last);
    await tester.tap(find.text('Log out').last);
    await waitFor(tester, find.text('Login'));
  }

  testWidgets('MOB-4 MOB-5 M2 screens: accounts, groups, include in totals, '
      'categories, budgets, stats, settings, and the read-only role', (
    tester,
  ) async {
    expect(_email, isNotEmpty, reason: 'pass --dart-define=M2_EMAIL=...');
    final stamp = DateTime.now().millisecondsSinceEpoch % 1000000;
    final group = 'Grp $stamp';
    final groupRenamed = 'Grp $stamp b';
    final account = 'Acc $stamp';
    final accountRenamed = 'Acc $stamp e';
    final expenseCat = 'Exp $stamp';
    final expenseCatRenamed = 'Exp $stamp e';
    final incomeCat = 'Inc $stamp';
    final incomeCatRenamed = 'Inc $stamp e';

    // main() does this before the app starts; push needs it (PUSH-1).
    await Firebase.initializeApp();
    await SecureStorageService().clear();
    final prefs = await PreferencesService.open();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          envProvider.overrideWithValue(EnvConfig.fromDefines()),
          preferencesServiceProvider.overrideWithValue(prefs),
          pushMessagingProvider.overrideWithValue(_NoPush()),
        ],
        child: const OewangApp(),
      ),
    );

    // 1. Sign in (or, on the first run, sign up into a new workspace).
    if (_signUp) {
      await signUp(tester, 'M2 Tester', _email, _password);
    } else {
      await login(tester, _email, _password);
    }
    await enterWorkspace(tester);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    final currency = _ok(
      await container.read(workspacesRepositoryProvider).current(),
    ).currencyCode;
    Money money(String v) =>
        Money(amount: Decimal.parse(v), currency: currency);

    Future<Money> apiTotal() async {
      final wallets = _ok(
        await container.read(walletsRepositoryProvider).list(),
      );
      var total = Money.zero(currency: currency);
      for (final w in wallets) {
        if (w.currency == currency && w.isIncludedInTotals) {
          total += Money(amount: w.balance, currency: currency);
        }
      }
      return total;
    }

    Finder walletsTotal(Money m) => find.descendant(
      of: find.byType(WalletsScreen),
      matching: find.text(m.format()),
    );

    // The Accounts tab opens before anything changes, as a person would see
    // it; it stays mounted under the other tabs from here on.
    await tab(tester, 'Accounts');
    await waitFor(tester, walletsTotal(await apiTotal()));
    await snap(tester, '01-accounts-before');

    // 2. Account group: create, then rename (`/v1/wallet-groups`).
    await openMore(tester, 'Accounts Setting');
    await waitFor(tester, find.text('Account Group'));
    await tester.tap(find.text('Account Group'));
    await waitFor(tester, find.byType(AccountGroupScreen));
    await tester.tap(inScreen(AccountGroupScreen, find.byIcon(Icons.add)));
    await waitFor(tester, find.byType(AccountGroupFormScreen));
    await typeInto(
      tester,
      inScreen(AccountGroupFormScreen, find.byType(TextField)),
      group,
    );
    await saveAndClose(tester, AccountGroupFormScreen);
    await reveal(
      tester,
      AccountGroupScreen,
      inScreen(AccountGroupScreen, find.text(group)),
    );
    await tester.tap(rowAction(group, 'Edit'));
    await waitFor(tester, find.byType(AccountGroupFormScreen));
    await typeInto(
      tester,
      inScreen(AccountGroupFormScreen, find.byType(TextField)),
      groupRenamed,
    );
    await saveAndClose(tester, AccountGroupFormScreen);
    await reveal(
      tester,
      AccountGroupScreen,
      inScreen(AccountGroupScreen, find.text(groupRenamed)),
    );
    await snap(tester, '02-group-renamed');
    await back(tester, 'Accounts'); // Account Group -> Accounts Setting
    await back(tester, 'Settings'); // Accounts Setting -> More

    // 3. Account with an opening balance: create, then adjust.
    await tab(tester, 'Accounts');
    await tester.tap(inScreen(WalletsScreen, find.byIcon(Icons.add)));
    await waitFor(tester, find.byType(AccountFormScreen));
    await tapRow(tester, AccountFormScreen, 'Group');
    await waitFor(tester, find.text(groupRenamed));
    await tester.ensureVisible(find.text(groupRenamed).last);
    await tester.tap(find.text(groupRenamed).last);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(
      inScreen(AccountFormScreen, find.byType(TextField)).first,
      account,
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tapRow(tester, AccountFormScreen, 'Amount');
    await keypad(tester, '150000');
    await snap(tester, '03-account-form');
    await saveAndClose(tester, AccountFormScreen);
    final accountRow = find.ancestor(
      of: find.text(account),
      matching: find.byType(ListTile),
    );
    await reveal(
      tester,
      WalletsScreen,
      inScreen(WalletsScreen, find.text(account)),
    );
    expect(
      find.descendant(
        of: accountRow,
        matching: find.text(money('150000').format()),
      ),
      findsOneWidget,
      reason: 'the new account lists its opening balance',
    );
    // Its group header carries the renamed group's name.
    expect(inScreen(WalletsScreen, find.text(groupRenamed)), findsOneWidget);
    await waitFor(tester, walletsTotal(await apiTotal()));
    await snap(tester, '04-account-created');

    // Edit: rename and move the balance to 1.500.000 (one more 0).
    await tester.tap(inScreen(WalletsScreen, find.text(account)));
    await waitFor(tester, find.byType(AccountFormScreen));
    await tester.enterText(
      inScreen(AccountFormScreen, find.byType(TextField)).first,
      accountRenamed,
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tapRow(tester, AccountFormScreen, 'Amount');
    await keypad(tester, '0');
    await saveAndClose(tester, AccountFormScreen);
    await reveal(
      tester,
      WalletsScreen,
      inScreen(WalletsScreen, find.text(accountRenamed)),
    );
    final renamedRow = find.ancestor(
      of: find.text(accountRenamed),
      matching: find.byType(ListTile),
    );
    expect(
      find.descendant(
        of: renamedRow,
        matching: find.text(money('1500000').format()),
      ),
      findsOneWidget,
    );
    final totalIncluded = await apiTotal();
    await waitFor(tester, walletsTotal(totalIncluded));
    await snap(tester, '05-account-edited');

    // 4. Include in totals: untick the account, the totals drop by its
    // balance; tick it again, they come back.
    await openMore(tester, 'Accounts Setting');
    await waitFor(tester, find.text('Include in totals'));
    await tester.tap(find.text('Include in totals'));
    await waitFor(tester, find.byType(IncludeInTotalsScreen));
    final includeRow = inScreen(
      IncludeInTotalsScreen,
      find.text(accountRenamed),
    );
    await reveal(tester, IncludeInTotalsScreen, includeRow);
    await tester.tap(includeRow);
    final totalExcluded = totalIncluded - money('1500000');
    await waitFor(
      tester,
      inScreen(IncludeInTotalsScreen, find.text(totalExcluded.format())),
    );
    await tester.pump(const Duration(seconds: 1)); // the PATCH lands
    await snap(tester, '06-include-unticked');
    expect(await apiTotal(), totalExcluded);
    await back(tester, 'Accounts');
    await back(tester, 'Settings');
    await tab(tester, 'Accounts');
    await waitFor(tester, walletsTotal(totalExcluded));
    await snap(tester, '07-accounts-excluded');
    await openMore(tester, 'Accounts Setting');
    await waitFor(tester, find.text('Include in totals'));
    await tester.tap(find.text('Include in totals'));
    await waitFor(tester, find.byType(IncludeInTotalsScreen));
    await reveal(tester, IncludeInTotalsScreen, includeRow);
    await tester.tap(includeRow);
    await waitFor(
      tester,
      inScreen(IncludeInTotalsScreen, find.text(totalIncluded.format())),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(await apiTotal(), totalIncluded);
    await back(tester, 'Accounts');
    await back(tester, 'Settings');
    await tab(tester, 'Accounts');
    await waitFor(tester, walletsTotal(totalIncluded));

    // 5. Categories: create and rename one expense and one income category.
    Future<void> category(String menu, String name, String renamed) async {
      await openMore(tester, menu);
      await waitFor(tester, find.byType(CategoryListScreen));
      await tester.tap(inScreen(CategoryListScreen, find.byIcon(Icons.add)));
      await waitFor(tester, find.byType(CategoryFormScreen));
      await typeInto(
        tester,
        inScreen(CategoryFormScreen, find.byType(TextField)),
        name,
      );
      await saveAndClose(tester, CategoryFormScreen);
      await reveal(
        tester,
        CategoryListScreen,
        inScreen(CategoryListScreen, find.text(name)),
      );
      await tester.tap(rowAction(name, 'Edit'));
      await waitFor(tester, find.byType(CategoryFormScreen));
      await typeInto(
        tester,
        inScreen(CategoryFormScreen, find.byType(TextField)),
        renamed,
      );
      await saveAndClose(tester, CategoryFormScreen);
      await reveal(
        tester,
        CategoryListScreen,
        inScreen(CategoryListScreen, find.text(renamed)),
      );
    }

    await category('Expenses Category Setting', expenseCat, expenseCatRenamed);
    await snap(tester, '08-expense-category');
    await back(tester, 'Settings');
    await category('Income Category Setting', incomeCat, incomeCatRenamed);
    await snap(tester, '09-income-category');
    await back(tester, 'Settings');

    // 6. Budget of 200.000 for the new expense category.
    await openMore(tester, 'Budget Setting');
    await waitFor(tester, find.byType(BudgetSettingScreen));
    await tester.pump(const Duration(seconds: 1)); // empty state or the list
    final createBudget = inScreen(
      BudgetSettingScreen,
      find.text('Create Budget'),
    );
    await tester.tap(
      createBudget.evaluate().isNotEmpty
          ? createBudget
          : inScreen(BudgetSettingScreen, find.byIcon(Icons.add)),
    );
    await waitFor(tester, find.byType(BudgetFormScreen));
    await tapRow(tester, BudgetFormScreen, 'Category');
    await waitFor(tester, find.text(expenseCatRenamed));
    await tester.ensureVisible(find.text(expenseCatRenamed).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(expenseCatRenamed).last);
    await tester.pump(const Duration(milliseconds: 500));
    await tapRow(tester, BudgetFormScreen, 'Monthly Limit');
    await keypad(tester, '200000');
    await snap(tester, '10-budget-form');
    await saveAndClose(tester, BudgetFormScreen);
    await reveal(
      tester,
      BudgetSettingScreen,
      inScreen(BudgetSettingScreen, find.text(expenseCatRenamed)),
    );
    await back(tester, 'Settings');

    // The Stats tab's Budget pill, before the expense: it stays mounted.
    await tab(tester, 'Stats');
    await tester.tap(inScreen(StatsScreen, find.text('Budget')));
    await waitFor(
      tester,
      inScreen(StatsScreen, find.text('Remaining (Monthly)')),
    );

    // 7. An expense of 50.000 in that category from the new account.
    await tab(tester, 'Trans');
    await tester.tap(find.byIcon(Icons.add));
    await keypad(tester, '50000');
    await waitFor(tester, find.text(expenseCatRenamed));
    await tester.ensureVisible(find.text(expenseCatRenamed).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(expenseCatRenamed).last);
    await tester.pump(const Duration(milliseconds: 500));
    await waitFor(tester, find.text(accountRenamed));
    await tester.ensureVisible(find.text(accountRenamed).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(accountRenamed).last);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(
      inScreen(TransactionFormScreen, find.byType(TextField)).first,
      'M2 budget spend $stamp',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await snap(tester, '11-expense-form');
    await saveAndClose(tester, TransactionFormScreen);

    // The budget as the API states it: spent 50.000, 150.000 left, 25%.
    final month = _ok(await container.read(budgetsRepositoryProvider).status());
    final budget = month.budgets.firstWhere(
      (b) => b.categoryName == expenseCatRenamed,
    );
    expect(budget.spent, money('50000'));
    expect(budget.remaining, money('150000'));
    expect(budget.percentage, 25);

    // Accounts tab, still mounted: the balance moved by the expense.
    await tab(tester, 'Accounts');
    await reveal(
      tester,
      WalletsScreen,
      inScreen(WalletsScreen, find.text(accountRenamed)),
    );
    await waitFor(
      tester,
      find.descendant(
        of: renamedRow,
        matching: find.text(money('1450000').format()),
      ),
    );
    await waitFor(tester, walletsTotal(await apiTotal()));
    await snap(tester, '12-accounts-after-expense');

    // 8. Stats: the month's expense and the budget remaining, from the API.
    final now = DateTime.now();
    final overview = _ok(
      await container
          .read(overviewRepositoryProvider)
          .overview(
            from: DateTime(now.year, now.month),
            to: DateTime(now.year, now.month + 1, 0),
          ),
    );
    await tab(tester, 'Stats');
    await waitFor(
      tester,
      inScreen(StatsScreen, find.text(month.totals.remaining.format())),
    );
    await snap(tester, '13-stats-budget');
    await tester.tap(inScreen(StatsScreen, find.text('Stats')));
    await waitFor(
      tester,
      inScreen(StatsScreen, find.text('Exp. ${overview.expense.format()}')),
    );
    await snap(tester, '14-stats');

    // Budget Setting lists the same figures.
    await openMore(tester, 'Budget Setting');
    final budgetRow = find.ancestor(
      of: find.text(expenseCatRenamed),
      matching: find.byType(InkWell),
    );
    await reveal(
      tester,
      BudgetSettingScreen,
      inScreen(BudgetSettingScreen, find.text(expenseCatRenamed)),
    );
    expect(
      find.descendant(
        of: budgetRow,
        matching: find.text(budget.spent.format()),
      ),
      findsWidgets,
    );
    expect(
      find.descendant(
        of: budgetRow,
        matching: find.text(budget.remaining.format()),
      ),
      findsWidgets,
    );
    expect(
      inScreen(BudgetSettingScreen, find.text('${month.totals.percent}%')),
      findsOneWidget,
    );
    await snap(tester, '15-budget-setting');
    await back(tester, 'Settings');

    // 9. Settings: name, colours, feedback, members.
    final newName = 'M2 Tester $stamp';
    await tab(tester, 'More');
    final nameButton = find.byWidgetPredicate(
      (w) =>
          w is Semantics &&
          (w.properties.label?.startsWith('Edit name') ?? false),
    );
    await reveal(tester, SettingsScreen, nameButton);
    await tester.tap(nameButton);
    await waitFor(tester, find.byType(AlertDialog));
    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      newName,
    );
    await press(
      tester,
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Save'),
      ),
    );
    await waitFor(tester, inScreen(SettingsScreen, find.text(newName)));
    await snap(tester, '16-profile-name');

    await openMore(tester, 'Style');
    await waitFor(tester, find.byType(StyleScreen));
    await tester.tap(find.text('Income: Red, Expenses: Blue'));
    await tester.pump(const Duration(seconds: 1));
    await snap(tester, '17-style-red-blue');
    expect(
      container.read(transactionColorSchemeProvider),
      TransactionColorScheme.redBlue,
    );
    await tester.tap(find.text('Income: Blue, Expenses: Red'));
    await tester.pump(const Duration(seconds: 1));
    expect(
      container.read(transactionColorSchemeProvider),
      TransactionColorScheme.blueRed,
    );
    await back(tester, 'Settings');

    await openMore(tester, 'Send Feedback');
    await waitFor(tester, find.byType(FeedbackFormScreen));
    await tester.tap(find.text('Feature'));
    await tester.enterText(
      inScreen(FeedbackFormScreen, find.byType(TextField)),
      'M2 device check $stamp: the accounts tab reads well.',
    );
    await press(tester, inScreen(FeedbackFormScreen, find.text('Send')));
    await waitFor(tester, find.text('Thanks — we got it.'));
    await snap(tester, '18-feedback-sent');
    await waitGone(tester, find.byType(FeedbackFormScreen));

    await openMore(tester, 'Members');
    await waitFor(tester, inScreen(MembersScreen, find.text(_email)));
    await snap(tester, '19-members');
    await back(tester, 'Settings');

    // 10. The read-only role (MOB-5): invite the viewer as a member, sign in
    // as them and find no write control.
    if (_viewerEmail.isEmpty) return;
    final api = container.read(apiClientProvider);
    final members = (await api.get('/workspaces/current/members')).data;
    final isMember = '$members'.contains(_viewerEmail);
    String? token;
    if (!isMember) {
      final res = await api.post(
        '/workspaces/current/invites',
        data: {'email': _viewerEmail, 'role': 'member'},
      );
      token = ((res.data as Map)['data'] as Map)['token'] as String;
    }
    await logout(tester);
    if (_viewerSignUp) {
      await signUp(tester, 'M2 Viewer', _viewerEmail, _viewerPassword);
      await waitFor(tester, find.text('Create workspace'));
    } else {
      await login(tester, _viewerEmail, _viewerPassword);
    }
    if (token != null) {
      if (!_viewerSignUp) await waitFor(tester, find.text('Trans.'));
      container.read(appRouterProvider).go('/accept-invite?token=$token');
    }
    await waitFor(tester, find.text('Trans.'));
    await tester.pump(const Duration(seconds: 1)); // the session's role lands
    expect(container.read(canWriteProvider), isFalse);
    // No add button on Trans., Accounts or Budget Setting.
    expect(find.byIcon(Icons.add).hitTestable(), findsNothing);
    await snap(tester, '20-viewer-trans');
    await tab(tester, 'Accounts');
    await reveal(
      tester,
      WalletsScreen,
      inScreen(WalletsScreen, find.text(accountRenamed)),
    );
    expect(inScreen(WalletsScreen, find.byIcon(Icons.add)), findsNothing);
    expect(
      inScreen(WalletsScreen, find.byIcon(Icons.edit_outlined)),
      findsNothing,
    );
    await tester.tap(inScreen(WalletsScreen, find.text(accountRenamed)));
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(AccountFormScreen), findsNothing);
    await snap(tester, '21-viewer-accounts');
    await openMore(tester, 'Budget Setting');
    await waitFor(tester, find.byType(BudgetSettingScreen));
    await tester.pump(const Duration(seconds: 1));
    expect(inScreen(BudgetSettingScreen, find.byIcon(Icons.add)), findsNothing);
    await snap(tester, '22-viewer-budget');
    await back(tester, 'Settings');
  });
}
