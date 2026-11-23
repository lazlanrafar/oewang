// The M3 offline path against a running local stack (MOB-6, MOB-7, D114,
// D115): offline, create a wallet, a category and a transaction that uses
// both, then edit it; come back online and watch the queue replay in order
// with client ids and If-Match, one lost response included. Then two
// conflicts, one discarded and one applied anyway. Every call is OWE1 to the
// real API.
//
// A simulator shares the Mac's network, so "offline" is made inside the test:
// the connectivity plugin's channels answer what the test says, and an
// interceptor in front of the app's own Dio refuses every request while the
// transport is down. The app's real code does the queueing.
//
//   docker compose -f infra/docker-compose.yml up        # api on :3002
//   cd apps/native
//   fvm flutter drive -d <simulator> \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/m3_offline_flow_test.dart \
//     --dart-define-from-file=env/dev.json \
//     --dart-define=M3_EMAIL=m3-<stamp>@oewang.local \
//     --dart-define=M3_PASSWORD=<password> \
//     --dart-define=M3_SIGNUP=true           # first run only
//
// Lines starting `M3SHOT <name>` ask the host to take a simulator screenshot
// (`xcrun simctl io <udid> screenshot`); the test holds still for a moment.
// Lines starting `M3HTTP` are the requests the app sent, as the test saw them.

import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:oewang/app.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_screen.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/categories/categories_form_screen.dart';
import 'package:oewang/components/organisms/sync/sync_issues_sheet.dart';
import 'package:oewang/components/organisms/sync/sync_status_banner.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/category.dart';

const _email = String.fromEnvironment('M3_EMAIL');
const _password = String.fromEnvironment('M3_PASSWORD');
const _signUp = bool.fromEnvironment('M3_SIGNUP');

/// The device's link to the API, as the test decides it.
class _Net extends Interceptor {
  bool down = false;

  /// The next `POST` to this path reaches the API, but its answer is lost.
  String? loseNextPost;
  final log = <String>[];

  @override
  void onRequest(RequestOptions o, RequestInterceptorHandler h) {
    if (down) {
      return h.reject(
        DioException.connectionError(requestOptions: o, reason: 'offline'),
      );
    }
    final ifMatch = o.headers['If-Match'];
    log.add('${o.method} ${o.path}${ifMatch == null ? '' : ' If-Match'}');
    debugPrint('M3HTTP ${log.last}');
    h.next(o);
  }
}

/// Added last, so it sees the opened answer and the OWE1 session stays whole.
class _LoseAnswer extends Interceptor {
  _LoseAnswer(this.net);
  final _Net net;

  @override
  void onResponse(Response<dynamic> r, ResponseInterceptorHandler h) {
    final o = r.requestOptions;
    if (o.method == 'POST' && o.path == net.loseNextPost) {
      net.loseNextPost = null;
      debugPrint('M3HTTP answer lost: ${o.method} ${o.path} ${r.statusCode}');
      return h.reject(
        DioException.connectionError(requestOptions: o, reason: 'lost'),
      );
    }
    h.next(r);
  }
}

/// Push is not under test, and its permission prompt covers the screen in
/// every simulator screenshot.
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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final net = _Net();
  var connected = true;
  MockStreamHandlerEventSink? connectivity;

  Future<void> waitFor(
    WidgetTester tester,
    Finder finder, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (finder.evaluate().isNotEmpty) {
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
    debugPrint('M3SHOT zz-timeout');
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    fail('timed out waiting for $finder');
  }

  Future<void> waitUntil(
    WidgetTester tester,
    bool Function() test,
    String what, {
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (test()) return;
    }
    fail('timed out waiting for $what');
  }

  /// Asks the host for a simulator screenshot and holds still while it runs.
  Future<void> shot(WidgetTester tester, String name) async {
    debugPrint('M3SHOT $name');
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
  }

  Future<void> press(WidgetTester tester, String label) async {
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.ensureVisible(find.text(label).last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text(label).last);
  }

  Future<void> saveAndClose(WidgetTester tester, Type screen) async {
    await press(tester, 'Save');
    for (var i = 0; i < 100; i++) {
      if (find.byType(screen).evaluate().isEmpty) return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('$screen did not close after Save');
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

  Finder inScreen(Type screen, Finder matching) =>
      find.descendant(of: find.byType(screen), matching: matching);

  Future<void> tapVisible(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f.last);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(f.last);
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// Picks [name] in an open entity picker: a lazy grid that builds only
  /// the cells on screen, and a row made offline sorts last.
  Future<void> pick(WidgetTester tester, String name) async {
    await waitFor(tester, find.byType(GridView));
    await tester.scrollUntilVisible(
      find.text(name),
      150,
      scrollable: find
          .descendant(
            of: find.byType(GridView).last,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tapVisible(tester, find.text(name));
  }

  void setOnline({required bool online}) {
    connected = online;
    net.down = !online;
    connectivity?.success([if (online) 'wifi' else 'none']);
  }

  testWidgets('MOB-6 MOB-7 offline writes queue, replay in order, and a '
      'conflict is discarded or applied anyway', (tester) async {
    expect(_email, isNotEmpty, reason: 'pass --dart-define=M3_EMAIL=...');

    // The connectivity plugin's channels, answered by the test.
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('dev.fluttercommunity.plus/connectivity'),
        (_) async => [if (connected) 'wifi' else 'none'],
      )
      ..setMockStreamHandler(
        const EventChannel('dev.fluttercommunity.plus/connectivity_status'),
        MockStreamHandler.inline(
          onListen: (_, sink) {
            connectivity = sink;
          },
          onCancel: (_) {
            connectivity = null;
          },
        ),
      );
    addTearDown(() {
      messenger
        ..setMockMethodCallHandler(
          const MethodChannel('dev.fluttercommunity.plus/connectivity'),
          null,
        )
        ..setMockStreamHandler(
          const EventChannel('dev.fluttercommunity.plus/connectivity_status'),
          null,
        );
    });

    await Firebase.initializeApp();
    await SecureStorageService().clear();
    final prefs = await PreferencesService.open();
    final env = EnvConfig.fromDefines();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          envProvider.overrideWithValue(env),
          preferencesServiceProvider.overrideWithValue(prefs),
          pushMessagingProvider.overrideWithValue(_NoPush()),
        ],
        child: const OewangApp(),
      ),
    );
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OewangApp)),
    );
    container.read(apiClientProvider).dioForTest.interceptors
      ..insert(0, net)
      ..add(_LoseAnswer(net));

    // 1. Our own user and workspace, never the demo one.
    await waitFor(tester, find.text('Login'));
    if (_signUp) {
      await tester.tap(find.text('Sign up'));
      await waitFor(tester, find.text('Create account'));
      Finder f(int i) => inScreen(RegisterScreen, find.byType(TextField)).at(i);
      await tester.enterText(f(0), 'M3 Offline');
      await tester.enterText(f(1), _email);
      await tester.enterText(f(2), _password);
      await tester.enterText(f(3), _password);
      await tester.pump();
      await tapVisible(tester, find.text('Create account'));
      await waitFor(tester, find.text('Create workspace'));
      await tester.enterText(
        inScreen(OnboardingScreen, find.byType(TextField)).first,
        'M3 offline',
      );
      await tester.pump();
      await tapVisible(tester, find.text('Continue'));
    } else {
      await tester.enterText(find.byType(TextField).at(0), _email);
      await tester.enterText(find.byType(TextField).at(1), _password);
      await tester.pump();
      await tester.tap(find.text('Login'));
    }
    await waitFor(tester, find.text('Trans.'));

    final sync = container.read(syncServiceProvider);
    final router = container.read(appRouterProvider);
    final ws = sync.workspaceId!;
    // A run that stopped half way leaves its queue behind; start clean.
    for (final e in await sync.db.entries(ws)) {
      await sync.db.deleteEntry(e.id);
    }
    // A second session on the same account: the "someone else" who edits.
    final other = ApiClient.build(env: env, storage: SecureStorageService());

    final stamp = DateTime.now().millisecondsSinceEpoch % 1000000;
    final walletName = 'M3 Wallet $stamp';
    final categoryName = 'M3 Cat $stamp';
    final note = 'M3 tx $stamp';

    // Fill the caches while online: what the device knows before the signal
    // goes (wallets, groups, categories, this month).
    router.go(AppRoutes.accounts);
    await waitFor(tester, find.text('Accounts'));
    final groups = await container.read(walletGroupsRepositoryProvider).list();
    final groupName = groups.fold((g) => g.first.name, (e) => fail('$e'));
    await container
        .read(categoriesRepositoryProvider)
        .list(type: CategoryType.expense);
    router.go(AppRoutes.trans);
    await waitFor(tester, find.text('Trans.'));
    await tester.pump(const Duration(seconds: 2));

    // 2. Offline.
    setOnline(online: false);
    await waitUntil(tester, () => !sync.online, 'the app to see offline');
    await waitFor(tester, find.text('Offline'));
    await shot(tester, '01-offline');

    // 2a. A wallet.
    unawaited(router.push(AppRoutes.accountForm));
    await waitFor(tester, find.byType(AccountFormScreen));
    await tapVisible(tester, find.text('Choose a group'));
    await waitFor(tester, find.text(groupName));
    await tapVisible(tester, find.text(groupName));
    await tester.enterText(
      inScreen(AccountFormScreen, find.byType(TextField)).first,
      walletName,
    );
    await tester.pump();
    await shot(tester, '02-wallet-form-offline');
    await saveAndClose(tester, AccountFormScreen);

    // 2b. A category.
    unawaited(router.push(AppRoutes.categoryAdd, extra: CategoryType.expense));
    await waitFor(tester, find.byType(CategoryFormScreen));
    await tester.enterText(
      inScreen(CategoryFormScreen, find.byType(TextField)).first,
      categoryName,
    );
    await tester.pump();
    await saveAndClose(tester, CategoryFormScreen);
    expect([
      for (final r in await sync.db.rows(ws, 'categories')) r['name'],
    ], contains(categoryName));

    // 2c. A transaction on both.
    router.go(AppRoutes.trans);
    await waitFor(tester, find.text('Trans.'));
    await tester.tap(find.byIcon(Icons.add).last);
    await waitFor(tester, find.byType(AmountKeypad));
    await keypad(tester, '25000');
    await pick(tester, categoryName);
    await pick(tester, walletName);
    await tester.enterText(
      inScreen(TransactionFormScreen, find.byType(TextField)).first,
      note,
    );
    await tester.pump();
    await saveAndClose(tester, TransactionFormScreen);
    await waitFor(tester, find.text(note));

    expect((await sync.db.entries(ws)).length, 3);
    expect(sync.status.value.pending, 3);
    await waitFor(tester, find.text('Offline, 3 changes saved on this device'));
    await shot(tester, '03-offline-three-queued');

    // 2d. Edit it offline: 25.000 -> 250.000.
    await tester.tap(find.text(note));
    final amount = inScreen(
      TransactionFormScreen,
      find.textContaining('25.000'),
    );
    await waitFor(tester, amount);
    await tester.tap(amount.first);
    await waitFor(tester, find.byType(AmountKeypad));
    await keypad(tester, '0');
    await saveAndClose(tester, TransactionFormScreen);
    await waitFor(tester, find.textContaining('250.000'));
    await waitFor(tester, find.text('Offline, 4 changes saved on this device'));

    // The new wallet's balance is an estimate.
    router.go(AppRoutes.accounts);
    final walletRow = find.widgetWithText(ListTile, walletName);
    await waitFor(tester, walletRow);
    expect(
      find.descendant(of: walletRow, matching: find.text('Estimate, syncing')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: walletRow, matching: find.textContaining('250.000')),
      findsOneWidget,
    );
    await shot(tester, '04-wallet-estimate');

    // 3. Online: replay in order; the transaction's first answer is lost, so
    // its create goes twice and the repeat answers 200 (D114).
    final txEntry = (await sync.db.entries(
      ws,
    )).firstWhere((e) => e.kind == 'transactions');
    final txId = txEntry.entityId;
    final walletId = (await sync.db.entries(
      ws,
    )).firstWhere((e) => e.kind == 'wallets').entityId;
    net
      ..log.clear()
      ..loseNextPost = '/transactions';
    setOnline(online: true);
    await waitUntil(
      tester,
      () => sync.status.value.isIdle,
      'the queue to drain',
      timeout: const Duration(seconds: 60),
    );
    final sent = net.log
        .where(
          (l) =>
              !l.startsWith('GET') &&
              !l.contains('/auth') &&
              !l.contains('/handshake'),
        )
        .toList();
    debugPrint('M3HTTP replay: $sent');
    expect(sent, [
      'POST /wallets',
      'POST /categories',
      'POST /transactions',
      'POST /transactions',
      'PATCH /transactions/$txId If-Match',
    ]);

    await waitFor(tester, walletRow);
    await waitUntil(
      tester,
      () => find
          .descendant(of: walletRow, matching: find.text('Estimate, syncing'))
          .evaluate()
          .isEmpty,
      'the estimate to go',
    );
    final apiWallet =
        envelopeData(await other.get('/wallets/$walletId'))! as Map;
    expect(
      Decimal.parse(apiWallet['balance'] as String),
      Decimal.parse('-250000'),
    );
    expect(
      find.descendant(of: walletRow, matching: find.textContaining('250.000')),
      findsOneWidget,
    );
    await shot(tester, '05-synced-api-balance');

    // 4. Conflicts. [resolve] is the button on the sheet; [want] is the
    // name the API ends with.
    Future<void> conflict(String round, String resolve, String want) async {
      router.go(AppRoutes.trans);
      await waitFor(tester, find.text('Trans.'));
      setOnline(online: false);
      await waitUntil(tester, () => !sync.online, 'offline');
      await waitFor(tester, find.textContaining(' $stamp'));
      await tester.tap(find.textContaining(' $stamp').first);
      await waitFor(tester, find.byType(TransactionFormScreen));
      await tester.enterText(
        inScreen(TransactionFormScreen, find.byType(TextField)).first,
        'mine $round $stamp',
      );
      await tester.pump();
      await saveAndClose(tester, TransactionFormScreen);
      await waitFor(tester, find.text('mine $round $stamp'));

      // Someone else changes the same row on the API meanwhile. A PATCH
      // carries the whole body, as the app's own form sends it.
      final cur = envelopeData(await other.get('/transactions/$txId'))! as Map;
      await other.patch(
        '/transactions/$txId',
        data: {
          for (final k in const [
            'type',
            'wallet_id',
            'to_wallet_id',
            'category_id',
            'amount',
            'date',
            'description',
          ])
            k: cur[k],
          'name': 'theirs $round $stamp',
        },
      );

      setOnline(online: true);
      await waitUntil(
        tester,
        () => sync.status.value.conflicts == 1,
        'the conflict',
      );
      await waitFor(tester, find.textContaining('1 changed elsewhere'));
      await shot(tester, '06-$round-conflict-banner');
      await tester.tap(find.byType(SyncStatusBanner));
      await waitFor(tester, find.text('Changes to review'));
      expect(
        find.text('Changed elsewhere since you changed it'),
        findsOneWidget,
      );
      await shot(tester, '07-$round-conflict-sheet');
      await tapVisible(tester, inScreen(SyncIssuesSheet, find.text(resolve)));
      await waitUntil(
        tester,
        () => find.byType(SyncIssuesSheet).evaluate().isEmpty,
        'the sheet to close',
      );
      await waitUntil(
        tester,
        () => sync.status.value.isIdle,
        'the queue to drain',
      );
      final row = envelopeData(await other.get('/transactions/$txId'))! as Map;
      expect(row['name'], want);
      await waitFor(tester, find.text(want));
      await shot(tester, '08-$round-resolved');
    }

    await conflict('A', 'Discard my change', 'theirs A $stamp');
    await conflict('B', 'Apply anyway', 'mine B $stamp');
  });
}
