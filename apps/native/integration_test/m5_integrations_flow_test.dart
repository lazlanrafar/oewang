// The M5 path against a running local stack (PUSH-1, MOB-9): push token
// registration and removal, push tap routing, an invitation link accepted
// by a signed-out person, Telegram's settings screen and the passkey button.
// Every call is OWE1 to the real API.
//
// FCM cannot run here: the system "allow notifications" dialog cannot be
// tapped from a Flutter test, and a simulator has no APNs token. The push
// messaging provider is replaced by a fake that grants permission, returns
// a fixed token and lets the test feed taps; everything past it is real.
//
//   docker compose -f infra/docker-compose.yml up        # api on :3002
//   cd apps/native
//   fvm flutter drive -d <simulator> \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/m5_integrations_flow_test.dart \
//     --dart-define-from-file=env/dev.json \
//     --dart-define=M5_USERS=<stamp> --dart-define=M5_RUN=<stamp> \
//     --dart-define=M5_PASSWORD=<password>
//
// M5_USERS names the two accounts, `m5-owner-<stamp>@oewang.local` and
// `m5-invitee-<stamp>@oewang.local`; keep it between runs, registering is
// rate limited. The owner is created on the first run; the invitee signs up
// through the invitation on the first run and signs in on later ones.
// M5_RUN is new on every run: it names the workspace the owner invites into
// and the fake device token.
//
// The test prints `M5MARK <name>` and holds the screen still for a moment, so
// a host script can take `xcrun simctl io <udid> screenshot` and read the
// database at that point: `binding.takeScreenshot` comes back blank once the
// keyboard has opened.

import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/organisms/auth/auth_login_screen.dart';
import 'package:oewang/components/organisms/auth/auth_passkey_view_model.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/budgets/budgets_setting_screen.dart';
import 'package:oewang/components/organisms/settings/profile/settings_user_profile_header.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/settings/telegram/settings_telegram_screen.dart';
import 'package:oewang/components/organisms/settings/workspace/settings_workspace_card.dart';
import 'package:oewang/components/organisms/settings/workspace/settings_workspace_switcher_sheet.dart';
import 'package:oewang/components/organisms/transactions/transactions_screen.dart';
import 'package:oewang/components/organisms/vault/vault_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';
import 'package:oewang/data/repositories_remote/device_tokens_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/passkeys/passkey_authenticator.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

const _users = String.fromEnvironment('M5_USERS');
const _run = String.fromEnvironment('M5_RUN');
const _password = String.fromEnvironment('M5_PASSWORD');
const _owner = 'm5-owner-$_users@oewang.local';
const _invitee = 'm5-invitee-$_users@oewang.local';

/// FCM without FCM: permission granted, a fixed token, taps fed by the test.
class _FakeMessaging implements PushMessaging {
  _FakeMessaging(this._token);

  final String _token;
  final taps = StreamController<String?>.broadcast();

  @override
  String get platform => 'ios';

  @override
  Future<bool> requestPermission() async => true;

  @override
  Future<String?> token() async => _token;

  @override
  Stream<String> get tokenRefresh => const Stream.empty();

  @override
  Stream<String?> get tapped => taps.stream;

  @override
  Future<String?> launchedFrom() async => null;
}

/// The real repository, noting each call's outcome and the workspace the
/// session was in, so the test can wait for a registration it caused.
class _RecordingDeviceTokens implements DeviceTokensRepository {
  _RecordingDeviceTokens(this._inner, this._workspace, this.calls);

  final DeviceTokensRepository _inner;
  final String? Function() _workspace;
  final List<String> calls;

  @override
  Future<Result<void, AppError>> register({
    required String token,
    required String platform,
  }) async {
    final ws = _workspace();
    final res = await _inner.register(token: token, platform: platform);
    calls.add('register:${res.isOk ? 'ok' : 'err'}:$ws');
    return res;
  }

  @override
  Future<Result<void, AppError>> unregister(String token) async {
    final res = await _inner.unregister(token);
    calls.add('unregister:${res.isOk ? 'ok' : 'err'}');
    return res;
  }
}

/// A line for the host script, which reads flutter drive's output.
// ignore: avoid_print, the device log is the only channel to the host.
void say(String line) => print(line);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  var lastMark = 'start';

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
        // A page that has just appeared is still sliding in.
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    fail('timed out waiting for $finder');
  }

  Future<void> waitUntil(
    WidgetTester tester,
    bool Function() done,
    String what, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      if (done()) return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('timed out waiting for $what');
  }

  /// Tells the host script to take a screenshot and read the database, and
  /// holds the screen still while it does.
  Future<void> mark(WidgetTester tester, String name) async {
    await tester.pump(const Duration(milliseconds: 400));
    say('M5MARK $name');
    lastMark = name;
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
  }

  /// Taps a button below text fields. No "done" key first: on the last
  /// field it submits the form, and the button turns into a spinner.
  Future<void> press(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target.last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(target.last);
  }

  Finder fieldIn(Type screen, int i) => find
      .descendant(of: find.byType(screen), matching: find.byType(TextField))
      .at(i);

  Future<void> signOut(WidgetTester tester) async {
    await tester.tap(find.text('More'));
    await waitFor(tester, find.byType(SettingsScreen));
    await tester.scrollUntilVisible(
      find.text('Log out'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(SettingsScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(find.text('Log out'));
    await waitFor(tester, find.text('Log out').last);
    await tester.tap(find.text('Log out').last);
    await waitFor(tester, find.byType(LoginScreen));
  }

  testWidgets('PUSH-1 MOB-9 push token, push taps, an invitation link, '
      'Telegram and passkeys on the device', (tester) async {
    expect(_users, isNotEmpty, reason: 'pass --dart-define=M5_USERS');
    expect(_run, isNotEmpty, reason: 'pass --dart-define=M5_RUN');
    expect(_password, isNotEmpty, reason: 'pass --dart-define=M5_PASSWORD');

    // flutter_test reports a framework error only once the test ends; this
    // says which step it came from.
    final reportError = FlutterError.onError;
    FlutterError.onError = (details) {
      say('M5ERROR after $lastMark: ${details.exceptionAsString()}');
      reportError?.call(details);
    };

    // main() does this before the app starts.
    await Firebase.initializeApp();
    await SecureStorageService().clear();
    final prefs = await PreferencesService.open();
    final messaging = _FakeMessaging('m5-fake-fcm-$_run');
    final calls = <String>[];
    final overrides = [
      envProvider.overrideWithValue(EnvConfig.fromDefines()),
      preferencesServiceProvider.overrideWithValue(prefs),
      pushMessagingProvider.overrideWithValue(messaging),
      deviceTokensRepositoryProvider.overrideWith(
        (ref) => _RecordingDeviceTokens(
          DeviceTokensRepositoryRemote(ref.watch(apiClientProvider)),
          () => ref.read(sessionControllerProvider).valueOrNull?.workspaceId,
          calls,
        ),
      ),
    ];

    // 0. The owner exists with a workspace of their own; whether the invitee
    // exists decides sign-up or sign-in below. Outside the app's session.
    final setup = ProviderContainer(overrides: overrides);
    final auth = setup.read(authRepositoryProvider);
    if ((await auth.login(email: _owner, password: _password)).isErr) {
      final reg = await auth.register(
        name: 'M5 Owner',
        email: _owner,
        password: _password,
      );
      expect(reg.isOk, isTrue, reason: 'owner sign-up: $reg');
      final ws = await setup
          .read(workspacesRepositoryProvider)
          .create(name: 'M5 Owner home', currencyCode: 'IDR');
      expect(ws.isOk, isTrue, reason: 'owner workspace: $ws');
    }
    await auth.logout();
    final inviteeExists = (await auth.login(
      email: _invitee,
      password: _password,
    )).isOk;
    if (inviteeExists) await auth.logout();
    setup.dispose();
    await SecureStorageService().clear();

    await tester.pumpWidget(
      ProviderScope(overrides: overrides, child: const OewangApp()),
    );
    await waitFor(tester, find.byType(LoginScreen));
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    final router = container.read(appRouterProvider);
    String location() =>
        router.routerDelegate.currentConfiguration.uri.toString();
    String? workspace() =>
        container.read(sessionControllerProvider).valueOrNull?.workspaceId;
    int registered(String? ws) =>
        calls.where((c) => c == 'register:ok:$ws').length;

    // 1. Passkeys (MOB-9): the button shows on iOS. The simulator build is
    // not associated with the relying party, so a tap ends in a message.
    await waitFor(tester, find.text('Sign in with a passkey'));
    await mark(tester, '01-login-passkey-button');
    await tester.tap(find.text('Sign in with a passkey'));
    await tester.pump(const Duration(milliseconds: 500));
    await waitUntil(
      tester,
      () => !container.read(passkeyViewModelProvider).running,
      'the passkey ceremony to end',
      timeout: const Duration(seconds: 30),
    );
    final passkeyError = container.read(passkeyViewModelProvider).error;
    say('M5INFO passkey sign-in on the simulator: $passkeyError');
    // What the device itself said, which the screen deliberately hides.
    final started = await container
        .read(passkeysRepositoryProvider)
        .signInStart();
    final options = started.fold((c) => c.options, (e) => fail('start: $e'));
    say('M5INFO passkey rp: ${options['rpId']}');
    try {
      await DevicePasskeys().get(options);
      say('M5INFO passkey device: no error');
    } on Object catch (e) {
      say('M5INFO passkey device: ${e.runtimeType}: $e');
    }
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(container.read(sessionControllerProvider).valueOrNull, isNull);
    await mark(tester, '02-login-passkey-tapped');

    // 2. Push (PUSH-1): signing in registers the device in the workspace.
    await tester.enterText(fieldIn(LoginScreen, 0), _owner);
    await tester.enterText(fieldIn(LoginScreen, 1), _password);
    await press(tester, find.text('Login'));
    await waitFor(tester, find.text('Trans.'));
    final home = workspace();
    expect(home, isNotNull);
    await waitUntil(tester, () => registered(home) == 1, 'register on sign-in');
    await mark(tester, '03-owner-signed-in');

    // 3. Switching workspace registers again, from the new one.
    final created = await container
        .read(workspacesRepositoryProvider)
        .create(name: 'M5 run $_run', currencyCode: 'IDR');
    final runWs = created.fold((w) => w.id, (e) => fail('create: $e'));
    container.invalidate(userProfileProvider);
    await tester.tap(find.text('More'));
    await waitFor(tester, find.byType(WorkspaceCard));
    // The card is a skeleton until the profile, with the new workspace, loads.
    await waitFor(
      tester,
      find.descendant(
        of: find.byType(WorkspaceCard),
        matching: find.byType(Text),
      ),
    );
    await tester.tap(find.byType(WorkspaceCard));
    await waitFor(tester, find.text('Switch workspace'));
    // Each run adds a workspace; the sheet builds only the rows that fit.
    await tester.scrollUntilVisible(
      find.text('M5 run $_run'),
      200,
      scrollable: find
          .descendant(
            of: find.byType(WorkspaceSwitcherSheet),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pump(const Duration(milliseconds: 300));
    await mark(tester, '04-switcher');
    await tester.tap(find.text('M5 run $_run').last);
    await waitUntil(tester, () => workspace() == runWs, 'the switch');
    await waitUntil(tester, () => registered(runWs) == 1, 'register on switch');
    await mark(tester, '05-owner-switched');

    // 4. Telegram: the screen shows the server's state without crashing.
    container.invalidate(userProfileProvider);
    await waitFor(tester, find.byType(SettingsScreen));
    await tester.scrollUntilVisible(
      find.text('Telegram'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(SettingsScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    // Shown only where passkeys work, which iOS is.
    expect(find.text('Add a passkey'), findsOneWidget);
    await tester.tap(find.text('Telegram'));
    await waitFor(tester, find.byType(TelegramScreen));
    final telegramState = find.descendant(
      of: find.byType(TelegramScreen),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Text &&
            (w.data ?? '').contains(
              RegExp('not set up|Linked|Send receipts|[A-Z_]{6,}'),
            ),
      ),
    );
    await waitFor(tester, telegramState);
    final telegramText = (telegramState.evaluate().first.widget as Text).data;
    say('M5INFO telegram screen: $telegramText');
    await mark(tester, '06-telegram');
    if (find.text('Link Telegram').evaluate().isNotEmpty) {
      final link = await container.read(telegramRepositoryProvider).linkToken();
      final uri = link.fold((u) => u, (e) => fail('link-token: $e'));
      expect(uri.host, 't.me');
    }

    // 5. Push taps open the screen the payload names, and nothing else.
    final trans = find.byType(TransactionsScreen);
    final budgets = find.byType(BudgetSettingScreen);
    // The last five are refused payloads; only the first five are pictured.
    final taps = <(String?, String, Finder)>[
      (
        '/transactions?detail=abc123',
        '${AppRoutes.trans}?detail=abc123',
        trans,
      ),
      ('/transactions', AppRoutes.trans, trans),
      ('/vault?file=f1', '/vault?file=f1', find.byType(VaultScreen)),
      (
        '/budgets?month=2026-11',
        '${AppRoutes.budgetSettings}?month=2026-11',
        budgets,
      ),
      ('/workspaces', AppRoutes.more, find.byType(SettingsScreen)),
      ('/budgets?month=2026-13', AppRoutes.budgetSettings, budgets),
      ('/transactions?detail=../x', AppRoutes.trans, trans),
      ('https://evil.example/transactions', AppRoutes.trans, trans),
      ('/not-a-screen', AppRoutes.trans, trans),
      (null, AppRoutes.trans, trans),
    ];
    for (final (i, (route, want, screen)) in taps.indexed) {
      // From somewhere else, so every tap has to move the app. Each screen
      // is let finish sliding in: re-entering the shell while its old page
      // is still leaving puts its GlobalKey in the tree twice.
      router.go(AppRoutes.telegram);
      await waitFor(tester, find.byType(TelegramScreen));
      expect(location(), AppRoutes.telegram);
      messaging.taps.add(route);
      await waitUntil(tester, () => location() == want, 'tap $route -> $want');
      await waitFor(tester, screen);
      if (i < 5) await mark(tester, '07-tap-${i + 1}');
    }

    // 6. Invitation (MOB-9), the wrong account first: the owner opens the
    // invitee's link. A refused accept is rolled back, so the token still
    // works for the invitee afterwards.
    final invited = await container
        .read(apiClientProvider)
        .post(
          '/workspaces/current/invites',
          data: {'email': _invitee, 'role': 'member'},
        );
    final token = (envelopeData(invited)! as Map)['token'] as String;
    router.go('/accept-invite?token=$token');
    await waitFor(tester, find.text('This invitation cannot be used'));
    expect(find.textContaining(_owner), findsOneWidget);
    expect(workspace(), runWs);
    await mark(tester, '08-invite-wrong-account');
    await tester.tap(find.text('Go to the app'));
    await waitFor(tester, find.text('Trans.'));

    // 7. Signing out removes the device first, while the session works.
    await signOut(tester);
    expect(calls.last, 'unregister:ok');
    expect(workspace(), isNull);
    await mark(tester, '09-owner-signed-out');

    // 8. Signed out, the link goes to sign-up with the token kept; once
    // signed up (or in), the invitation is accepted and the session is in the
    // owner's workspace.
    router.go('/accept-invite?token=$token');
    await waitFor(tester, find.byType(RegisterScreen));
    expect(location(), AppRoutes.register);
    await mark(tester, '10-invite-signed-out');
    if (inviteeExists) {
      await press(tester, find.text('Sign in'));
      await waitFor(tester, find.byType(LoginScreen));
      await tester.enterText(fieldIn(LoginScreen, 0), _invitee);
      await tester.enterText(fieldIn(LoginScreen, 1), _password);
      await press(tester, find.text('Login'));
    } else {
      await tester.enterText(fieldIn(RegisterScreen, 0), 'M5 Invitee');
      await tester.enterText(fieldIn(RegisterScreen, 1), _invitee);
      await tester.enterText(fieldIn(RegisterScreen, 2), _password);
      await tester.enterText(fieldIn(RegisterScreen, 3), _password);
      await press(tester, find.text('Create account'));
    }
    await waitUntil(
      tester,
      () => workspace() == runWs,
      'the invitee in the run workspace',
      timeout: const Duration(seconds: 30),
    );
    await waitFor(tester, find.text('Trans.'));
    expect(
      container.read(sessionControllerProvider).valueOrNull?.role,
      'member',
    );
    final me = await container.read(usersRepositoryProvider).getProfile();
    final profile = me.fold((p) => p, (e) => fail('/auth/me: $e'));
    expect(profile.email, _invitee);
    expect(profile.activeWorkspaceId, runWs);
    // Joining is a way into a workspace: the device moves to the invitee.
    await waitUntil(tester, () => registered(runWs) == 2, 'register on join');
    await mark(tester, '11-invitee-joined');

    await signOut(tester);
    expect(calls.last, 'unregister:ok');
    await mark(tester, '12-invitee-signed-out');
    say('M5INFO device token calls: $calls');
    FlutterError.onError = reportError;
  });
}
