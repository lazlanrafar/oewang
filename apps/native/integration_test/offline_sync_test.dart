import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:oewang/components/molecules/sync_status_banner.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/debts_repository_offline.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_offline.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/api/oewang_crypto.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:rxdart/rxdart.dart';

// Control only the connectivity signal. Repositories, Dio, encryption, SQLite,
// secure storage, and the actual loopback HTTP connection are real.
class OfflineSignal extends Mock implements ConnectivityService {}

class LocalServer {
  final wallets = <String, Map<String, dynamic>>{};
  final transactions = <String, Map<String, dynamic>>{};
  final debts = <String, Map<String, dynamic>>{};
  final paths = <String>[];
  final crypto = OewangCrypto(secret: '01234567890123456789012345678901');
  HttpServer? server;
  int port = 0;

  Future<void> start() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    port = server!.port;
    server!.listen((request) async {
      try {
        paths.add('${request.method} ${request.uri.path}');
        final envelope =
            jsonDecode(await utf8.decoder.bind(request).join())
                as Map<String, dynamic>;
        if (request.headers.value('x-encrypted') != 'true') {
          throw const FormatException('Expected encrypted request');
        }
        final body = jsonDecode(crypto.decrypt(envelope['data'] as String));
        Object data;
        switch (request.uri.path) {
          case '/v1/wallets':
            final wallet = (body as Map).cast<String, dynamic>();
            final id = wallet['id'] as String;
            data = wallets.putIfAbsent(id, () => Map.of(wallet));
          case '/v1/transactions/bulk':
            final confirmed = <Map<String, dynamic>>[];
            for (final row in body as List) {
              final tx = (row as Map).cast<String, dynamic>();
              if (tx['amount'] is! String) {
                throw const FormatException('Bulk amount must be a string');
              }
              final id = tx['id'] as String;
              final wallet = wallets[tx['walletId']];
              if (wallet == null) {
                throw const FormatException('Wallet must sync first');
              }
              if (!transactions.containsKey(id)) {
                transactions[id] = Map.of(tx);
                wallet['balance'] =
                    (num.parse('${wallet['balance']}') -
                            num.parse(tx['amount'] as String))
                        .toString();
              }
              confirmed.add(transactions[id]!);
            }
            data = {'transactions': confirmed, 'failures': <Object>[]};
          case '/v1/debts':
            final debt = (body as Map).cast<String, dynamic>();
            data = debts.putIfAbsent(
              debt['id'] as String,
              () => {
                ...debt,
                'remainingAmount': debt['amount'],
                'status': 'unpaid',
              },
            );
          default:
            throw const FormatException('Unexpected request');
        }
        request.response.headers.set('x-encrypted', 'true');
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({
            'data': crypto.encrypt(jsonEncode({'success': true, 'data': data})),
          }),
        );
      } on Object catch (e) {
        request.response.statusCode = 422;
        request.response.write(
          jsonEncode({'success': false, 'message': e.toString()}),
        );
      } finally {
        await request.response.close();
      }
    });
  }

  Future<void> stop() async {
    await server?.close(force: true);
    server = null;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'should persist offline writes and sync once over encrypted HTTP after reconnect',
    (tester) async {
      final dir = await Directory.systemTemp.createTemp(
        'oewang-offline-device',
      );
      final file = File('${dir.path}/cache.sqlite');
      var db = AppDatabase.withExecutor(NativeDatabase(file));
      final storage = SecureStorageService();
      const sessionKey = 'oewang-integration-test-session';
      final token =
          'header.${base64Url.encode(utf8.encode(jsonEncode({'workspace_id': 'test-workspace'})))}.signature';
      final backend = LocalServer();
      await backend.start();
      await storage.writeToken(sessionKey, token);
      final api = ApiClient.build(
        env: EnvConfig(
          apiUrl: 'http://127.0.0.1:${backend.port}',
          appUrl: 'http://127.0.0.1',
          encryptionKey: '01234567890123456789012345678901',
          sessionCookieName: sessionKey,
        ),
        storage: storage,
      );
      final connectivity = OfflineSignal();
      when(connectivity.isOnline).thenAnswer((_) async => false);
      const ws = 'test-workspace';
      try {
        await backend.stop(); // Actual HTTP connection is now unavailable.
        var sync = SyncService(db: db, api: api, workspaceId: () => ws);
        final walletRepo = WalletsRepositoryOffline(
          remote: WalletsRepositoryRemote(api),
          db: db,
          connectivity: connectivity,
          sync: sync,
          workspaceId: () => ws,
        );
        final txRepo = TransactionsRepositoryOffline(
          remote: TransactionsRepositoryRemote(api),
          db: db,
          connectivity: connectivity,
          sync: sync,
          workspaceId: () => ws,
        );
        final debtRepo = DebtsRepositoryOffline(
          remote: DebtsRepositoryRemote(api),
          db: db,
          connectivity: connectivity,
          sync: sync,
          workspaceId: () => ws,
        );
        final wallet =
            (await walletRepo.create(
                      const NewWalletDraft(name: 'Offline cash', balance: 100),
                    )
                    as Success<Wallet, AppError>)
                .value;
        final tx =
            (await txRepo.create(
                      NewTransactionDraft(
                        type: TransactionType.expense,
                        amount: 10,
                        date: DateTime(2026, 1, 5),
                        walletId: wallet.id,
                      ),
                    )
                    as Success<Transaction, AppError>)
                .value;
        await txRepo.update(
          tx.id,
          NewTransactionDraft(
            type: TransactionType.expense,
            amount: 25,
            date: DateTime(2026, 1, 5),
            walletId: wallet.id,
          ),
        );
        await debtRepo.create(
          contactId: 'test-contact',
          type: DebtType.payable,
          amount: 50,
        );
        final list = await txRepo.list(
          TransactionsListQuery(from: DateTime(2026), to: DateTime(2026, 2)),
        );
        expect(
          (list as Success<List<Transaction>, AppError>)
              .value
              .single
              .amount
              .amount,
          25,
        );
        await db.close();
        db = AppDatabase.withExecutor(NativeDatabase(file));
        expect(
          (await db.select(db.cachedTransactions).getSingle()).pendingOp,
          kPendingOpCreate,
        );
        sync = SyncService(db: db, api: api, workspaceId: () => ws);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              pendingSyncCountProvider.overrideWith(
                (_) => Rx.combineLatest3<int, int, int, int>(
                  db.watchPendingTransactionsCount(ws),
                  db.watchPendingWalletsCount(ws),
                  db.watchPendingDebtsCount(ws),
                  (a, b, c) => a + b + c,
                ),
              ),
              syncIssuesProvider.overrideWith((_) => db.watchSyncIssues(ws)),
            ],
            child: const MaterialApp(home: Scaffold(body: SyncStatusBanner())),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('3 changes waiting to sync'), findsOneWidget);
        await backend.start();
        await sync.flush();
        await sync.flush(); // Nothing should be posted twice.
        expect(backend.wallets.length, 1);
        expect(backend.transactions.length, 1);
        expect(backend.debts.length, 1);
        expect(num.parse('${backend.wallets[wallet.id]!['balance']}'), 75);
        expect(backend.paths, [
          'POST /v1/wallets',
          'POST /v1/transactions/bulk',
          'POST /v1/debts',
        ]);
        await tester.pumpAndSettle();
        expect(find.byType(ListTile), findsNothing);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        api.raw.close(force: true);
        await backend.stop();
        await storage.deleteToken(sessionKey);
        await db.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
