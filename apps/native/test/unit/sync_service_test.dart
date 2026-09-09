import 'dart:async';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';

class MockApiClient extends Mock implements ApiClient {}

Response<dynamic> _jsonResponse(Map<String, dynamic> data) => Response(
  requestOptions: RequestOptions(path: '/transactions/bulk'),
  statusCode: 200,
  data: data,
);

void main() {
  group('SyncService', () {
    late AppDatabase db;
    late MockApiClient api;
    late SyncService sync;

    setUp(() {
      db = AppDatabase.withExecutor(NativeDatabase.memory());
      api = MockApiClient();
      sync = SyncService(db: db, api: api, workspaceId: () => 'ws1');
      registerFallbackValue(<Map<String, dynamic>>[]);
    });

    tearDown(() => db.close());

    Future<void> insertPendingCreate(String id) => db
        .into(db.cachedTransactions)
        .insert(
          CachedTransactionsCompanion.insert(
            id: id,
            workspaceId: 'ws1',
            type: 'expense',
            amount: 10000,
            date: DateTime(2026, 1, 1),
            walletId: 'wallet1',
            pendingOp: const Value(kPendingOpCreate),
            dirtySince: Value(DateTime.now()),
          ),
        );

    test('clears pendingOp for rows the server confirms', () async {
      await insertPendingCreate('tx1');
      await insertPendingCreate('tx2');

      when(
        () => api.post(
          any(),
          data: any(named: 'data'),
          workspaceId: any(named: 'workspaceId'),
        ),
      ).thenAnswer(
        (_) async => _jsonResponse({
          'data': {
            'transactions': [
              {'id': 'tx1'},
              {'id': 'tx2'},
            ],
            'failures': <Map<String, dynamic>>[],
          },
        }),
      );

      await sync.flush();

      final rows = await db.select(db.cachedTransactions).get();
      expect(rows.every((r) => r.pendingOp == null), isTrue);
      expect(rows.every((r) => r.syncError == null), isTrue);
    });

    test(
      'a row the server rejects keeps pendingOp and records the reason',
      () async {
        await insertPendingCreate('tx1');
        await insertPendingCreate('tx2');

        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({
            'data': {
              'transactions': [
                {'id': 'tx1'},
              ],
              'failures': [
                {'index': 1, 'reason': 'Amount must be a number'},
              ],
            },
          }),
        );

        await sync.flush();

        final tx1 = await (db.select(
          db.cachedTransactions,
        )..where((t) => t.id.equals('tx1'))).getSingle();
        final tx2 = await (db.select(
          db.cachedTransactions,
        )..where((t) => t.id.equals('tx2'))).getSingle();
        expect(tx1.pendingOp, isNull);
        expect(tx2.pendingOp, kPendingOpCreate);
        expect(tx2.syncError, 'Amount must be a number');
        expect(tx2.attemptCount, 1);
      },
    );

    test(
      'a network failure backs every row in the batch off instead of clearing it',
      () async {
        await insertPendingCreate('tx1');

        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenThrow(
          DioException(
            requestOptions: RequestOptions(path: '/transactions/bulk'),
          ),
        );

        await sync.flush();

        final tx1 = await (db.select(
          db.cachedTransactions,
        )..where((t) => t.id.equals('tx1'))).getSingle();
        expect(tx1.pendingOp, kPendingOpCreate);
        expect(tx1.attemptCount, 1);
        expect(tx1.syncError, isNotNull);
      },
    );

    test('never flushes a row queued under a different workspace', () async {
      await db
          .into(db.cachedTransactions)
          .insert(
            CachedTransactionsCompanion.insert(
              id: 'other-ws-tx',
              workspaceId: 'ws-other',
              type: 'expense',
              amount: 5000,
              date: DateTime(2026, 1, 1),
              walletId: 'wallet1',
              pendingOp: const Value(kPendingOpCreate),
              dirtySince: Value(DateTime.now()),
            ),
          );

      await sync.flush();

      verifyNever(
        () => api.post(
          any(),
          data: any(named: 'data'),
          workspaceId: any(named: 'workspaceId'),
        ),
      );
      final row = await (db.select(
        db.cachedTransactions,
      )..where((t) => t.id.equals('other-ws-tx'))).getSingle();
      expect(row.pendingOp, kPendingOpCreate); // untouched
    });

    test(
      'should send string amounts when creating a transaction batch',
      () async {
        await insertPendingCreate('tx1');
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          final rows = call.namedArguments[#data] as List;
          expect((rows.single as Map)['amount'], '10000.0');
          expect(call.namedArguments[#workspaceId], 'ws1');
          return _jsonResponse({
            'data': {
              'transactions': [
                {'id': 'tx1'},
              ],
            },
          });
        });
        await sync.flush();
      },
    );

    test(
      'should preserve newer edits when a create acknowledgement arrives',
      () async {
        await insertPendingCreate('tx1');
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((_) async {
          await (db.update(
            db.cachedTransactions,
          )..where((t) => t.id.equals('tx1'))).write(
            const CachedTransactionsCompanion(
              amount: Value(20000),
              revision: Value(1),
            ),
          );
          return _jsonResponse({
            'data': {
              'transactions': [
                {'id': 'tx1', 'amount': '10000'},
              ],
            },
          });
        });
        await sync.flush();
        final row = await db.select(db.cachedTransactions).getSingle();
        expect(row.amount, 20000);
        expect(row.pendingOp, kPendingOpUpdate);
        when(
          () => api.put(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({
            'data': {'id': 'tx1', 'amount': '20000'},
          }),
        );
        await sync.flush();
        expect(
          (await db.select(db.cachedTransactions).getSingle()).pendingOp,
          isNull,
        );
      },
    );

    test(
      'should enqueue an update when a replay returns an older create payload',
      () async {
        await insertPendingCreate('tx1');
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({
            'data': {
              'transactions': [
                {'id': 'tx1', 'amount': '5000'},
              ],
            },
          }),
        );
        await sync.flush();
        expect(
          (await db.select(db.cachedTransactions).getSingle()).pendingOp,
          kPendingOpUpdate,
        );
      },
    );

    test(
      'should retry after five seconds when the first request fails',
      () async {
        var now = DateTime(2026);
        sync = SyncService(
          db: db,
          api: api,
          workspaceId: () => 'ws1',
          now: () => now,
        );
        await insertPendingCreate('tx1');
        var calls = 0;
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((_) async {
          calls++;
          throw DioException(
            requestOptions: RequestOptions(path: '/transactions/bulk'),
          );
        });
        await sync.flush();
        await sync.flush();
        expect(calls, 1);
        now = now.add(const Duration(seconds: 5));
        await sync.flush();
        expect(calls, 2);
      },
    );

    test(
      'should sync the new wallet before its dependent transaction',
      () async {
        await db
            .into(db.cachedWallets)
            .insert(
              CachedWalletsCompanion.insert(
                id: 'wallet1',
                workspaceId: 'ws1',
                name: 'Cash',
                pendingOp: const Value(kPendingOpCreate),
              ),
            );
        await insertPendingCreate('tx1');
        final paths = <String>[];
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          final path = call.positionalArguments.first as String;
          paths.add(path);
          return _jsonResponse({
            'data': path == '/wallets'
                ? {'id': 'wallet1'}
                : {
                    'transactions': [
                      {'id': 'tx1'},
                    ],
                  },
          });
        });
        await sync.flush();
        expect(paths, ['/wallets', '/transactions/bulk']);
      },
    );

    test(
      'should defer dependent transactions when wallet sync fails',
      () async {
        await db
            .into(db.cachedWallets)
            .insert(
              CachedWalletsCompanion.insert(
                id: 'wallet1',
                workspaceId: 'ws1',
                name: 'Cash',
                pendingOp: const Value(kPendingOpCreate),
              ),
            );
        await insertPendingCreate('tx1');
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          expect(call.positionalArguments.first, '/wallets');
          throw DioException(requestOptions: RequestOptions(path: '/wallets'));
        });
        await sync.flush();
        expect(
          (await db.select(db.cachedTransactions).getSingle()).lastAttemptAt,
          isNull,
        );
      },
    );

    test(
      'should stop further requests when workspace changes during a batch',
      () async {
        var ws = 'ws1';
        sync = SyncService(db: db, api: api, workspaceId: () => ws);
        for (var i = 0; i < 51; i++) {
          await insertPendingCreate('tx$i');
        }
        var calls = 0;
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          calls++;
          ws = 'ws2';
          return _jsonResponse({
            'data': {'transactions': call.namedArguments[#data]},
          });
        });
        await sync.flush();
        expect(calls, 1);
        expect(
          (await db.select(db.cachedTransactions).get())
              .where((r) => r.pendingOp != null)
              .length,
          1,
        );
      },
    );

    test(
      'should keep wallet pending when the API returns a failure envelope',
      () async {
        await db
            .into(db.cachedWallets)
            .insert(
              CachedWalletsCompanion.insert(
                id: 'wallet1',
                workspaceId: 'ws1',
                name: 'Cash',
                pendingOp: const Value(kPendingOpCreate),
              ),
            );
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({'success': false, 'message': 'Rejected'}),
        );
        await sync.flush();
        final row = await db.select(db.cachedWallets).getSingle();
        expect(row.pendingOp, kPendingOpCreate);
        expect(row.syncError, isNotNull);
      },
    );

    test(
      'should drain another flush request when a write arrives during sync',
      () async {
        await insertPendingCreate('tx1');
        var calls = 0;
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          calls++;
          if (calls == 1) {
            await insertPendingCreate('tx2');
            unawaited(sync.flush());
          }
          return _jsonResponse({
            'data': {'transactions': call.namedArguments[#data]},
          });
        });
        await sync.flush();
        expect(calls, 2);
        expect(
          (await db.select(db.cachedTransactions).get()).every(
            (r) => r.pendingOp == null,
          ),
          isTrue,
        );
      },
    );

    test(
      'should preserve a newer update when an older update completes',
      () async {
        await insertPendingCreate('tx1');
        await db
            .update(db.cachedTransactions)
            .write(
              const CachedTransactionsCompanion(
                pendingOp: Value(kPendingOpUpdate),
              ),
            );
        when(
          () => api.put(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((_) async {
          await db
              .update(db.cachedTransactions)
              .write(
                const CachedTransactionsCompanion(
                  revision: Value(1),
                  amount: Value(30000),
                ),
              );
          return _jsonResponse({
            'data': {'id': 'tx1'},
          });
        });
        await sync.flush();
        final row = await db.select(db.cachedTransactions).getSingle();
        expect(row.pendingOp, kPendingOpUpdate);
        expect(row.amount, 30000);
      },
    );

    test(
      'should send explicit nulls when clearing category and transfer target on update',
      () async {
        await insertPendingCreate('tx1');
        await db
            .update(db.cachedTransactions)
            .write(
              const CachedTransactionsCompanion(
                pendingOp: Value(kPendingOpUpdate),
              ),
            );
        when(
          () => api.put(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((call) async {
          final body = call.namedArguments[#data] as Map;
          expect(body.containsKey('categoryId'), true);
          expect(body['categoryId'], isNull);
          expect(body.containsKey('toWalletId'), true);
          expect(body['toWalletId'], isNull);
          return _jsonResponse({
            'data': {'id': 'tx1'},
          });
        });
        await sync.flush();
        expect(
          (await db.select(db.cachedTransactions).getSingle()).pendingOp,
          isNull,
        );
      },
    );

    test(
      'should refresh derived debt fields when the matching revision is confirmed',
      () async {
        await db
            .into(db.cachedDebts)
            .insert(
              CachedDebtsCompanion.insert(
                id: 'd',
                workspaceId: 'ws1',
                contactId: 'c',
                type: 'payable',
                amount: 100,
                remainingAmount: 100,
                pendingOp: const Value(kPendingOpUpdate),
              ),
            );
        when(
          () => api.patch(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({
            'data': {'id': 'd', 'remainingAmount': '40', 'status': 'partial'},
          }),
        );
        await sync.flush();
        final row = await db.select(db.cachedDebts).getSingle();
        expect(row.remainingAmount, 40);
        expect(row.status, 'partial');
        expect(row.pendingOp, isNull);
      },
    );

    test(
      'should retain the five-minute cap when retry count is very large',
      () async {
        final now = DateTime(2026);
        sync = SyncService(
          db: db,
          api: api,
          workspaceId: () => 'ws1',
          now: () => now,
        );
        await insertPendingCreate('tx1');
        await db
            .update(db.cachedTransactions)
            .write(
              CachedTransactionsCompanion(
                attemptCount: const Value(2000),
                lastAttemptAt: Value(now.subtract(const Duration(minutes: 5))),
              ),
            );
        when(
          () => api.post(
            any(),
            data: any(named: 'data'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer(
          (_) async => _jsonResponse({
            'data': {
              'transactions': [
                {'id': 'tx1'},
              ],
            },
          }),
        );
        await sync.flush();
        expect(
          (await db.select(db.cachedTransactions).getSingle()).pendingOp,
          isNull,
        );
      },
    );
  });
}
