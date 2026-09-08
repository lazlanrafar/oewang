import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
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
        () => api.post(any(), data: any(named: 'data')),
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
          () => api.post(any(), data: any(named: 'data')),
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
          () => api.post(any(), data: any(named: 'data')),
        ).thenThrow(
          DioException(requestOptions: RequestOptions(path: '/transactions/bulk')),
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

    test(
      'never flushes a row queued under a different workspace',
      () async {
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

        verifyNever(() => api.post(any(), data: any(named: 'data')));
        final row = await (db.select(
          db.cachedTransactions,
        )..where((t) => t.id.equals('other-ws-tx'))).getSingle();
        expect(row.pendingOp, kPendingOpCreate); // untouched
      },
    );
  });
}
