import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';
import 'package:oewang/data/repositories_fake/device_tokens_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/push/push_service.dart';
import 'package:oewang/domain/models/session.dart';

class _FakeMessaging implements PushMessaging {
  _FakeMessaging({this.allow = true, this.launched});

  final bool allow;
  final String? launched;
  int asked = 0;
  final refresh = StreamController<String>.broadcast();
  final taps = StreamController<String?>.broadcast();

  @override
  String get platform => 'ios';

  @override
  Future<bool> requestPermission() async {
    asked++;
    return allow;
  }

  @override
  Future<String?> token() async => 'tok-1';

  @override
  Stream<String> get tokenRefresh => refresh.stream;

  @override
  Stream<String?> get tapped => taps.stream;

  @override
  Future<String?> launchedFrom() async => launched;
}

/// Logs `logout` where the tokens are cleared, into the shared call log.
class _LoggingAuth extends AuthRepositoryFake {
  _LoggingAuth(this.log, {super.loginWorkspaceId});

  final List<String> log;

  @override
  Future<void> logout() async {
    log.add('logout');
    await super.logout();
  }
}

void main() {
  group('PUSH-1 the device token follows the session', () {
    late List<String> log;
    late _LoggingAuth auth;
    late _FakeMessaging messaging;
    late ProviderContainer container;
    late AppDatabase db;

    ProviderContainer build({
      String? loginWorkspaceId = 'ws-1',
      bool allow = true,
    }) {
      log = [];
      auth = _LoggingAuth(log, loginWorkspaceId: loginWorkspaceId);
      messaging = _FakeMessaging(allow: allow);
      return ProviderContainer(
        overrides: [
          authRepositoryProvider.overrideWithValue(auth),
          workspacesRepositoryProvider.overrideWithValue(
            WorkspacesRepositoryFake(),
          ),
          deviceTokensRepositoryProvider.overrideWithValue(
            DeviceTokensRepositoryFake(log),
          ),
          pushMessagingProvider.overrideWithValue(messaging),
          appDatabaseProvider.overrideWithValue(
            db = AppDatabase(NativeDatabase.memory()),
          ),
        ],
      );
    }

    Future<Session> signIn() async {
      final res = await auth.login(
        email: auth.validEmail,
        password: auth.validPassword,
      );
      return (res as Success<Session, AppError>).value;
    }

    SessionController session() =>
        container.read(sessionControllerProvider.notifier);

    tearDown(() async {
      container.dispose();
      await db.close();
    });

    test('registers after sign-in, asking permission then', () async {
      container = build();
      await pumpEventQueue();
      expect(messaging.asked, 0, reason: 'not asked on the sign-in screen');

      await session().enter(await signIn());
      await pumpEventQueue();

      expect(messaging.asked, 1);
      expect(log, ['register tok-1 ios']);
    });

    test('registers again after a workspace switch', () async {
      container = build();
      await session().enter(await signIn());
      await pumpEventQueue();

      await session().switchTo('ws-2');
      await pumpEventQueue();

      expect(log, ['register tok-1 ios', 'register tok-1 ios']);
      expect(messaging.asked, 1, reason: 'asked once');
    });

    test('a session with no workspace waits for one to be created', () async {
      container = build(loginWorkspaceId: null);
      final signedIn = await signIn();
      await session().enter(signedIn);
      await pumpEventQueue();
      expect(log, isEmpty, reason: 'the route needs a workspace session');

      // Onboarding: create, switch, then enter the switched session.
      final switched = await auth.switchWorkspace('ws-new');
      await session().enter((switched as Success<Session, AppError>).value);
      await pumpEventQueue();

      expect(log, ['register tok-1 ios']);
    });

    test('sign-out removes the device before the tokens are cleared', () async {
      container = build();
      await session().enter(await signIn());
      await pumpEventQueue();

      await session().clear();

      expect(log, ['register tok-1 ios', 'unregister tok-1', 'logout']);
    });

    test('OEW-121 sign-out wipes the offline store, queue included', () async {
      container = build();
      await session().enter(await signIn());
      await db.putRow('ws-1', 'wallets', {'id': 'w1', 'name': 'Cash'});
      await db.enqueue(
        const QueueEntry(
          workspaceId: 'ws-1',
          kind: 'wallets',
          op: QueueOp.create,
          entityId: 'w1',
        ),
      );
      expect(await db.unsentCount(), 1);

      await session().clear();

      expect(await db.rows('ws-1', 'wallets'), isEmpty);
      expect(await db.unsentCount(), 0);
    });

    test('a refreshed token is registered while in a workspace', () async {
      container = build();
      await container.read(pushServiceProvider).start(); // as the app does
      await session().enter(await signIn());
      await pumpEventQueue();

      messaging.refresh.add('tok-2');
      await pumpEventQueue();
      await session().clear();

      expect(log, [
        'register tok-1 ios',
        'register tok-2 ios',
        'unregister tok-2',
        'logout',
      ]);
    });

    test('permission refused: nothing registered, nothing to remove', () async {
      container = build(allow: false);
      await session().enter(await signIn());
      await pumpEventQueue();
      await session().clear();

      expect(log, ['logout']);
    });
  });

  group('PUSH-1 a tapped push opens its screen', () {
    test('cold start and running taps go through the route map', () async {
      final opened = <String>[];
      final messaging = _FakeMessaging(launched: '/budgets?month=2026-11');
      final service = PushService(
        messaging: messaging,
        deviceTokens: DeviceTokensRepositoryFake(),
        open: opened.add,
      );
      await service.start();
      messaging.taps
        ..add('/transactions?detail=t1')
        ..add('/nowhere');
      await pumpEventQueue();

      expect(opened, [
        '${AppRoutes.budgetSettings}?month=2026-11',
        '${AppRoutes.trans}?detail=t1',
        AppRoutes.trans,
      ]);
      await service.dispose();
    });
  });
}
