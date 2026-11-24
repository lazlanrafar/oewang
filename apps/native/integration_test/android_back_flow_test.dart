// The Android system back key on the main screens (OEW-083): it closes the
// sheet, dialog or pushed screen on top and never leaves the app from a
// nested screen. The key is the real one: the test prints `BACKKEY <step>`
// and the host answers with `adb shell input keyevent KEYCODE_BACK`, so the
// press goes through the activity and Flutter's navigation channel.
//
//   cd apps/native
//   fvm flutter drive -d emulator-5554 \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/android_back_flow_test.dart \
//     --dart-define-from-file=env/dev-android.json \
//     --dart-define=BACK_EMAIL=<owner> --dart-define=BACK_PASSWORD=<pw> \
//     2>&1 | integration_test/android_host.sh
//
// Back at a tab's root leaves the app, which would end the test, so that
// one is checked by hand (docs/features/mobile.md).

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/organisms/chat/chat_screen.dart';
import 'package:oewang/components/organisms/chat/chat_sessions_screen.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/settings/style/settings_style_screen.dart';
import 'package:oewang/components/organisms/settings/workspace/settings_workspace_card.dart';
import 'package:oewang/components/organisms/settings/workspace/settings_workspace_switcher_sheet.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

const _email = String.fromEnvironment('BACK_EMAIL');
const _password = String.fromEnvironment('BACK_PASSWORD');

class _NoPush implements PushMessaging {
  @override
  String get platform => 'android';
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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> waitFor(
    WidgetTester tester,
    bool Function() done,
    String what, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (done()) {
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    fail('timed out waiting for $what');
  }

  bool shown(Finder f) => f.evaluate().isNotEmpty;

  testWidgets('OEW-083 Android back closes what is on top', (tester) async {
    expect(_email, isNotEmpty, reason: 'pass --dart-define=BACK_EMAIL=...');
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
    await waitFor(tester, () => shown(find.text('Login')), 'login');
    await tester.enterText(find.byType(TextField).at(0), _email);
    await tester.enterText(find.byType(TextField).at(1), _password);
    await tester.pump();
    await tester.tap(find.text('Login'));
    await waitFor(tester, () => shown(find.text('Trans.')), 'home');

    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    final router = container.read(appRouterProvider);
    String location() =>
        router.routerDelegate.currentConfiguration.uri.toString();

    /// One real back press; waits until [after] holds.
    Future<void> back(
      String step,
      bool Function() after, {
      bool closeKeyboard = true,
    }) async {
      if (closeKeyboard) FocusManager.instance.primaryFocus?.unfocus();
      await tester.pump(const Duration(milliseconds: 400));
      debugPrint('BACKKEY $step');
      await waitFor(tester, after, 'back: $step');
      debugPrint('BACKOK $step at ${location()}');
    }

    /// Taps a row of More, scrolled fully into view first: a built row can
    /// still sit in the list's cache area below its edge.
    Future<void> tapRow(Finder row, double delta) async {
      await tester.scrollUntilVisible(
        row,
        delta,
        scrollable: find
            .descendant(
              of: find.byType(SettingsScreen),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.ensureVisible(row.last);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(row.last);
    }

    // 1. The add form opens with the amount keypad sheet over it: back
    // closes the sheet, then the form, and the tab is where it was.
    final form = find.byType(TransactionFormScreen);
    final keypad = find.byType(AmountKeypad);
    await tester.tap(find.byIcon(Icons.add));
    await waitFor(tester, () => shown(keypad), 'the keypad');
    await back('keypad-sheet', () => !shown(keypad));
    // The form may open its next picker once the keypad is gone; each back
    // closes one thing, the sheet on top or the form itself.
    String layers() =>
        '${shown(form)}/${find.byType(BottomSheet).evaluate().length}';
    for (var i = 0; i < 3 && shown(form); i++) {
      final before = layers();
      await back('form-$i', () => layers() != before);
    }
    expect(form, findsNothing);
    expect(location(), AppRoutes.trans);
    expect(find.text('Trans.'), findsWidgets);

    // 2. A screen pushed from More.
    await tester.tap(find.text('More'));
    await waitFor(tester, () => shown(find.byType(SettingsScreen)), 'More');
    await tapRow(find.text('Style'), 300);
    await waitFor(tester, () => shown(find.byType(StyleScreen)), 'Style');
    await back('style', () => !shown(find.byType(StyleScreen)));
    expect(location(), AppRoutes.more);

    // 3. A sheet: the workspace switcher.
    final sheet = find.byType(WorkspaceSwitcherSheet);
    // The card is a skeleton, with no tap, until the profile loads.
    final card = find.descendant(
      of: find.byType(WorkspaceCard),
      matching: find.byType(Text),
    );
    // Back to the top of More, where the card is.
    await tester.drag(
      find
          .descendant(
            of: find.byType(SettingsScreen),
            matching: find.byType(Scrollable),
          )
          .first,
      const Offset(0, 3000),
    );
    await waitFor(tester, () => shown(card), 'the workspace card');
    await tapRow(find.byType(WorkspaceCard), -300);
    await waitFor(tester, () => shown(sheet), 'the switcher');
    await back('switcher-sheet', () => !shown(sheet));
    expect(location(), AppRoutes.more);

    // 4. A dialog: Log out's confirm. Back cancels; the session stays.
    final logOut = find.text('Log out');
    await tapRow(logOut, 300);
    await waitFor(tester, () => logOut.evaluate().length > 1, 'the confirm');
    await back('logout-dialog', () => logOut.evaluate().length == 1);
    expect(location(), AppRoutes.more);
    expect(container.read(sessionControllerProvider).valueOrNull, isNotNull);

    // 5. Two screens deep with the keyboard up: the first back only hides
    // the keyboard (the system does that), then each back pops one screen.
    await tapRow(find.text('Chat'), -300);
    final sessions = find.byType(ChatSessionsScreen);
    final chat = find.byType(ChatScreen);
    await waitFor(tester, () => shown(sessions), 'chat sessions');
    await tester.tap(find.byTooltip('New chat'));
    await waitFor(tester, () => shown(chat), 'a new chat');
    await tester.tap(
      find.descendant(of: chat, matching: find.byType(TextField)),
    );
    bool keyboardUp() => tester.view.viewInsets.bottom > 0;
    await waitFor(tester, keyboardUp, 'the keyboard');
    await back('chat-keyboard', () => !keyboardUp(), closeKeyboard: false);
    expect(shown(chat), isTrue, reason: 'back with the keyboard up popped');
    await back('chat', () => !shown(chat));
    expect(shown(sessions), isTrue);
    await back('chat-sessions', () => !shown(sessions));
    expect(location(), AppRoutes.more);
    debugPrint('BACKDONE');
  });
}
