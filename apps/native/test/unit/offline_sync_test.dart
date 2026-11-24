import 'dart:convert';
import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_offline/categories_repository_offline.dart';
import 'package:oewang/data/repositories_offline/transactions_repository_offline.dart';
import 'package:oewang/data/repositories_offline/wallet_groups_repository_offline.dart';
import 'package:oewang/data/repositories_offline/wallets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';

typedef Json = Map<String, dynamic>;

/// The API's offline contract in memory (D114, D115): client ids on create,
/// `If-Match` on `PATCH`, balances moved by transactions.
class FakeApi implements HttpClientAdapter {
  final rows = <String, Map<String, Json>>{
    'wallets': {},
    'categories': {},
    'transactions': {},
    'wallet-groups': {},
  };
  final deleted = <String>{};
  final log = <String>[];
  final ifMatches = <String?>[];

  /// The device thinks it is online, but nothing gets through.
  bool unreachable = false;

  /// The next request is handled and its answer lost on the way back.
  bool loseNextResponse = false;

  /// Paths answered with this error instead, once.
  final refuse = <String, (int, String, String)>{};

  var _clock = 0;
  String _now() =>
      '2026-11-23T04:05:06.${(++_clock).toString().padLeft(6, '0')}+00:00';

  Json seed(String kind, Json row) =>
      rows[kind]![row['id'] as String] = {...row, 'updated_at': _now()};

  /// An edit made on the web meanwhile.
  void editElsewhere(String kind, String id, Json patch) {
    rows[kind]![id] = {...rows[kind]![id]!, ...patch, 'updated_at': _now()};
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (unreachable) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'unreachable',
      );
    }
    final path = options.uri.path.replaceFirst('/v1', '');
    final method = options.method;
    log.add('$method $path');
    final refused = refuse.remove('$method $path');
    final answer = refused != null
        ? _error(refused.$1, refused.$2, refused.$3)
        : _handle(method, path, options);
    if (loseNextResponse) {
      loseNextResponse = false;
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'lost',
      );
    }
    return answer;
  }

  ResponseBody _handle(String method, String path, RequestOptions o) {
    final parts = path.split('/').where((p) => p.isNotEmpty).toList();
    final kind = parts[0];
    final table = rows[kind]!;
    final body = o.data is Map
        ? Map<String, dynamic>.from(o.data as Map)
        : <String, dynamic>{};
    switch (method) {
      case 'GET' when parts.length == 2:
        final row = table[parts[1]];
        return row == null || deleted.contains(parts[1])
            ? _error(404, 'TRANSACTION_NOT_FOUND', 'Not found')
            : _ok(200, row);
      case 'GET':
        return _ok(200, [
          for (final r in table.values)
            if (!deleted.contains(r['id'])) r,
        ]);
      case 'POST':
        final id = body['id'] as String;
        if (table.containsKey(id)) return _ok(200, table[id]);
        if (rows.values.any((t) => t.containsKey(id))) {
          return _error(409, 'ID_TAKEN', 'Id taken');
        }
        final row = <String, dynamic>{
          ...body,
          'updated_at': _now(),
          if (kind == 'wallets') ...{
            'balance': '0',
            'currency_code': 'IDR',
            'is_included_in_totals': true,
          },
          if (kind == 'transactions') ...{
            'base_amount': body['amount'],
            'wallet_currency_code': 'IDR',
            'wallet_name': rows['wallets']![body['wallet_id']]?['name'] ?? '',
          },
        };
        table[id] = row;
        if (kind == 'transactions') _move(row, 1);
        return _ok(201, row);
      case 'PATCH':
        final id = parts[1];
        final ifMatch = o.headers['If-Match'] as String?;
        ifMatches.add(ifMatch);
        final row = table[id];
        if (row == null) return _error(404, 'NOT_FOUND', 'Not found');
        final gone = deleted.contains(id);
        if (ifMatch != null && (gone || ifMatch != row['updated_at'])) {
          return _error(409, 'STALE', 'Changed elsewhere', {
            'current': gone ? null : row,
          });
        }
        if (kind == 'transactions') _move(row, -1);
        final next = <String, dynamic>{...row, ...body, 'updated_at': _now()};
        if (kind == 'transactions') _move(next, 1);
        table[id] = next;
        return _ok(200, next);
      case 'DELETE':
        final id = parts[1];
        if (!deleted.contains(id) && kind == 'transactions') {
          _move(table[id]!, -1);
        }
        deleted.add(id);
        return ResponseBody.fromString('', 204);
    }
    throw StateError('unhandled $method $path');
  }

  void _move(Json t, int sign) {
    void add(String? id, String amount) {
      final w = rows['wallets']![id];
      if (w == null) return;
      final d = Decimal.parse(amount) * Decimal.fromInt(sign);
      w['balance'] = '${Decimal.parse(w['balance'] as String) + d}';
    }

    final amount = t['amount'] as String;
    switch (t['type']) {
      case 'income':
        add(t['wallet_id'] as String, amount);
      case 'expense':
        add(t['wallet_id'] as String, '-$amount');
      case 'transfer':
        add(t['wallet_id'] as String, '-$amount');
        add(t['to_wallet_id'] as String?, amount);
    }
  }

  ResponseBody _ok(int status, Object? data) => ResponseBody.fromString(
    jsonEncode({'data': data}),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  ResponseBody _error(
    int status,
    String code,
    String message, [
    Json? details,
  ]) => ResponseBody.fromString(
    jsonEncode({
      'data': null,
      'error': {'code': code, 'message': message, 'details': ?details},
    }),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

class Harness {
  Harness({this.canWrite = true}) {
    final api = ApiClient(
      Dio(BaseOptions(baseUrl: 'http://fake/v1'))..httpClientAdapter = server,
    );
    sync = SyncService(
      db: db,
      api: api,
      workspaceId: () => 'ws1',
      canWrite: () => canWrite,
      onSynced: () => synced++,
    );
    transactions = TransactionsRepositoryOffline(
      remote: TransactionsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
    wallets = WalletsRepositoryOffline(
      remote: WalletsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
    categories = CategoriesRepositoryOffline(
      remote: CategoriesRepositoryRemote(api),
      api: api,
      sync: sync,
    );
    groups = WalletGroupsRepositoryOffline(
      remote: WalletGroupsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
  }

  final server = FakeApi();
  final db = AppDatabase(NativeDatabase.memory());
  final bool canWrite;
  late final SyncService sync;
  late final TransactionsRepositoryOffline transactions;
  late final WalletsRepositoryOffline wallets;
  late final CategoriesRepositoryOffline categories;
  late final WalletGroupsRepositoryOffline groups;
  int synced = 0;

  Future<void> offline() async {
    sync.setOnline(online: false);
    await sync.drain();
  }

  Future<void> online() async {
    sync.setOnline(online: true);
    await sync.drain();
  }

  Future<List<QueueEntry>> queue() => db.entries('ws1');

  Future<Wallet> wallet(String id) async =>
      (await wallets.list()).ok.firstWhere((w) => w.id == id);

  Future<void> dispose() async {
    sync.dispose();
    await db.close();
  }
}

extension<T> on Result<T, AppError> {
  T get ok => switch (this) {
    Success(:final value) => value,
    Failure(:final error) => throw StateError('expected ok, got $error'),
  };
}

NewTransactionDraft draft(
  String walletId,
  String amount, {
  TransactionType type = TransactionType.expense,
  String? toWalletId,
  String? categoryId,
}) => NewTransactionDraft(
  type: type,
  amount: Decimal.parse(amount),
  date: DateTime(2026, 11, 2),
  walletId: walletId,
  toWalletId: toWalletId,
  categoryId: categoryId,
  note: 'Lunch',
);

void main() {
  late Harness h;
  setUp(() => h = Harness());
  tearDown(() => h.dispose());

  test('MOB-6: a wallet, category and transaction made offline replay in '
      'order under their client ids', () async {
    await h.offline();
    final w = (await h.wallets.create(const NewWalletDraft(name: 'Cash'))).ok;
    final c = (await h.categories.create(
      name: 'Food',
      type: CategoryType.expense,
    )).ok;
    final t = (await h.transactions.create(
      draft(w.id, '50', categoryId: c.id),
    )).ok;

    expect(w.id, matches(RegExp(r'^[a-z][a-z0-9]{23,31}$')));
    expect(h.server.log, isEmpty);
    expect((await h.queue()).map((e) => '${e.op.name} ${e.kind}'), [
      'create wallets',
      'create categories',
      'create transactions',
    ]);
    // Read back from the cache while offline.
    expect((await h.categories.list(type: CategoryType.expense)).ok, [c]);
    expect(t.category?.name, 'Food');
    expect(t.wallet?.name, 'Cash');
    final estimate = await h.wallet(w.id);
    expect(estimate.balance, Decimal.parse('-50'));
    expect(estimate.balanceIsEstimate, isTrue);

    await h.online();

    expect(h.server.log, [
      'POST /wallets',
      'POST /categories',
      'POST /transactions',
    ]);
    expect(h.server.rows['wallets']!.keys, [w.id]);
    expect(h.server.rows['transactions']![t.id]!['category_id'], c.id);
    expect(await h.queue(), isEmpty);
    expect(h.sync.status.value.isIdle, isTrue);
    expect(h.synced, 1);
    final fresh = await h.wallet(w.id);
    expect(fresh.balance, Decimal.parse('-50'));
    expect(fresh.balanceIsEstimate, isFalse);
  });

  test('MOB-6: a create whose answer was lost replays as a 200 and books '
      'once', () async {
    h.server.seed('wallets', {
      'id': 'wcash000000000000000000000',
      'name': 'Cash',
      'balance': '100',
      'currency_code': 'IDR',
    });
    await h.wallets.list();
    h.server.loseNextResponse = true;

    final t = (await h.transactions.create(
      draft('wcash000000000000000000000', '30'),
    )).ok;
    await h.sync.drain();

    expect(h.server.log, [
      'GET /wallets',
      'POST /transactions',
      'POST /transactions',
    ]);
    expect(h.server.rows['transactions']!.keys, [t.id]);
    expect(
      h.server.rows['wallets']!['wcash000000000000000000000']!['balance'],
      '70',
    );
    expect(await h.queue(), isEmpty);
    expect(
      (await h.wallet('wcash000000000000000000000')).balance,
      Decimal.parse('70'),
    );
  });

  test('MOB-6: a network error keeps the entry queued, stops the replay, '
      'and the next pass sends in order', () async {
    h.server.seed('wallets', {
      'id': 'wcash000000000000000000000',
      'name': 'Cash',
      'balance': '0',
      'currency_code': 'IDR',
    });
    await h.wallets.list();
    await h.offline();
    final a = (await h.transactions.create(
      draft('wcash000000000000000000000', '1'),
    )).ok;
    final b = (await h.transactions.create(
      draft('wcash000000000000000000000', '2'),
    )).ok;
    h.server
      ..unreachable = true
      ..log.clear();

    await h.online();

    final q = await h.queue();
    expect(q.map((e) => (e.entityId, e.status, e.attempts)), [
      (a.id, QueueStatus.queued, 1),
      (b.id, QueueStatus.queued, 0),
    ]);
    expect(h.sync.status.value.pending, 2);
    expect(SyncService.backoff(1), const Duration(seconds: 2));
    expect(SyncService.backoff(20), const Duration(minutes: 5));

    h.server.unreachable = false;
    await h.sync.drain();
    expect(h.server.log, ['POST /transactions', 'POST /transactions']);
    expect(h.server.rows['transactions']!.keys, [a.id, b.id]);
    expect(await h.queue(), isEmpty);
  });

  test('MOB-6: another 4xx fails the entry with the API message, later '
      'entries still go, and discarding puts the row back', () async {
    h.server
      ..seed('wallets', {
        'id': 'wcash000000000000000000000',
        'name': 'Cash',
        'balance': '0',
        'currency_code': 'IDR',
      })
      ..seed('categories', {
        'id': 'cfood000000000000000000000',
        'name': 'Food',
        'type': 'expense',
      });
    await h.wallets.list();
    await h.categories.list();
    await h.offline();
    await h.wallets.delete('wcash000000000000000000000');
    await h.categories.update(id: 'cfood000000000000000000000', name: 'Meals');
    expect((await h.wallets.list()).ok, isEmpty);
    h.server.refuse['DELETE /wallets/wcash000000000000000000000'] = (
      409,
      'WALLET_HAS_TRANSACTIONS',
      'This account still has transactions',
    );

    await h.online();

    final q = await h.queue();
    expect(q, hasLength(1));
    expect(q.single.status, QueueStatus.failed);
    expect(q.single.error, 'This account still has transactions');
    expect(
      h.server.rows['categories']!['cfood000000000000000000000']!['name'],
      'Meals',
    );
    expect(h.sync.status.value.failed, 1);

    await h.sync.discard(q.single);
    expect(await h.queue(), isEmpty);
    expect((await h.wallet('wcash000000000000000000000')).name, 'Cash');
  });

  group('MOB-7', () {
    setUp(() async {
      h.server
        ..seed('wallets', {
          'id': 'wcash000000000000000000000',
          'name': 'Cash',
          'balance': '0',
          'currency_code': 'IDR',
        })
        ..seed('categories', {
          'id': 'cfood000000000000000000000',
          'name': 'Food',
          'type': 'expense',
        });
      await h.wallets.list();
      await h.categories.list();
      await h.offline();
      await h.wallets.update(
        'wcash000000000000000000000',
        const NewWalletDraft(name: 'Mine'),
      );
      await h.categories.update(
        id: 'cfood000000000000000000000',
        name: 'Meals',
      );
    });

    test('MOB-7: a stale edit is a conflict holding the current row; '
        'other rows carry on; discard takes the current row', () async {
      final base = h
          .server
          .rows['wallets']!['wcash000000000000000000000']!['updated_at'];
      h.server.editElsewhere('wallets', 'wcash000000000000000000000', {
        'name': 'Web name',
      });

      await h.online();

      // Sent back exactly as the API emitted it, microseconds and all.
      expect(h.server.ifMatches.first, base);
      expect(base, endsWith('.000001+00:00'));
      final q = await h.queue();
      expect(q.single.status, QueueStatus.conflict);
      expect(q.single.current?['name'], 'Web name');
      expect(
        h.server.rows['categories']!['cfood000000000000000000000']!['name'],
        'Meals',
      );
      expect(h.sync.status.value.conflicts, 1);

      await h.sync.discard(q.single);
      expect(await h.queue(), isEmpty);
      expect(
        h.server.rows['wallets']!['wcash000000000000000000000']!['name'],
        'Web name',
      );
      h.sync.setOnline(online: false);
      expect((await h.wallet('wcash000000000000000000000')).name, 'Web name');
    });

    test('MOB-7: apply anyway resends the edit without If-Match', () async {
      h.server.editElsewhere('wallets', 'wcash000000000000000000000', {
        'name': 'Web name',
      });
      await h.online();
      final conflict = (await h.queue()).single;

      await h.sync.applyAnyway(conflict);

      expect(h.server.ifMatches.last, isNull);
      expect(
        h.server.rows['wallets']!['wcash000000000000000000000']!['name'],
        'Mine',
      );
      expect(await h.queue(), isEmpty);
    });

    test(
      'MOB-7: a later edit to the same row waits behind the conflict',
      () async {
        await h.wallets.update(
          'wcash000000000000000000000',
          const NewWalletDraft(name: 'Mine again'),
        );
        h.server.editElsewhere('wallets', 'wcash000000000000000000000', {
          'name': 'Web name',
        });

        await h.online();

        expect((await h.queue()).map((e) => e.status), [
          QueueStatus.conflict,
          QueueStatus.queued,
        ]);
        expect(h.server.log.where((l) => l.startsWith('PATCH /wallets')), [
          'PATCH /wallets/wcash000000000000000000000',
        ]);
      },
    );

    test('MOB-7: an edit to a row deleted elsewhere conflicts with no '
        'current row, and discarding removes it here', () async {
      h.server.deleted.add('wcash000000000000000000000');

      await h.online();

      final conflict = (await h.queue()).single;
      expect(conflict.status, QueueStatus.conflict);
      expect(conflict.currentJson, 'null');
      await h.sync.discard(conflict);
      h.sync.setOnline(online: false);
      expect((await h.wallets.list()).ok, isEmpty);
    });
  });

  test('MOB-6: a balance with queued transactions is the cached balance plus '
      'their deltas, then the API figure once drained', () async {
    h.server
      ..seed('wallets', {
        'id': 'wcash000000000000000000000',
        'name': 'Cash',
        'balance': '100.50',
        'currency_code': 'IDR',
      })
      ..seed('wallets', {
        'id': 'wbank000000000000000000000',
        'name': 'Bank',
        'balance': '0',
        'currency_code': 'IDR',
      });
    await h.wallets.list();
    await h.offline();
    await h.transactions.create(draft('wcash000000000000000000000', '30.25'));
    final income = (await h.transactions.create(
      draft('wcash000000000000000000000', '10', type: TransactionType.income),
    )).ok;
    await h.transactions.create(
      draft(
        'wcash000000000000000000000',
        '5',
        type: TransactionType.transfer,
        toWalletId: 'wbank000000000000000000000',
      ),
    );
    await h.transactions.update(
      income.id,
      draft('wcash000000000000000000000', '12', type: TransactionType.income),
    );

    final cash = await h.wallet('wcash000000000000000000000');
    final bank = await h.wallet('wbank000000000000000000000');
    expect(cash.balance, Decimal.parse('77.25'));
    expect(cash.balanceIsEstimate, isTrue);
    expect(bank.balance, Decimal.parse('5'));

    await h.online();

    expect(
      h.server.rows['wallets']!['wcash000000000000000000000']!['balance'],
      '77.25',
    );
    final after = await h.wallet('wcash000000000000000000000');
    expect(after.balance, Decimal.parse('77.25'));
    expect(after.balanceIsEstimate, isFalse);
  });

  test('MOB-6: offline, the month reads from the cache and its summary is '
      'summed from it', () async {
    h.server.seed('wallets', {
      'id': 'wcash000000000000000000000',
      'name': 'Cash',
      'balance': '0',
      'currency_code': 'IDR',
    });
    await h.wallets.list();
    await h.transactions.create(draft('wcash000000000000000000000', '20'));
    await h.offline();
    await h.transactions.create(draft('wcash000000000000000000000', '5'));

    final from = DateTime(2026, 11);
    final to = DateTime(2026, 12, 0);
    final rows = (await h.transactions.list(
      TransactionsListQuery(from: from, to: to),
    )).ok;
    expect(rows, hasLength(2));
    // No summary was ever fetched, so no currency is known offline.
    expect(
      await h.transactions.summary(from: from, to: to),
      isA<Failure<dynamic, AppError>>(),
    );
    await h.db.putRow('ws1', 'meta', {'id': 'currency', 'code': 'IDR'});
    final summary = (await h.transactions.summary(from: from, to: to)).ok;
    expect(summary.expense.amount, Decimal.parse('25'));
    expect(summary.income.amount, Decimal.zero);
  });

  test('MOB-6: a viewer never queues a write', () async {
    await h.dispose();
    h = Harness(canWrite: false);
    h.server.unreachable = true;
    final res = await h.categories.create(
      name: 'Food',
      type: CategoryType.expense,
    );
    expect(res, isA<Failure<Category, AppError>>());
    expect(await h.queue(), isEmpty);
  });

  test('MOB-6: offline, wallet groups read from the cache, so the account '
      'form can still pick one', () async {
    h.server
      ..seed('wallet-groups', {'id': 'g1', 'name': 'Cash'})
      ..seed('wallet-groups', {'id': 'g2', 'name': 'Bank'});
    expect((await h.groups.list()).ok.map((g) => g.name), ['Cash', 'Bank']);
    await h.offline();
    h.server.unreachable = true;
    expect((await h.groups.list()).ok.map((g) => g.name), ['Cash', 'Bank']);
  });

  test(
    'PUSH-5: get(id) reads the API online and the cached row offline',
    () async {
      h.server.seed('wallets', {
        'id': 'wcash000000000000000000000',
        'name': 'Cash',
        'balance': '0',
        'currency_code': 'IDR',
      });
      await h.wallets.list();
      final t = (await h.transactions.create(
        draft('wcash000000000000000000000', '20'),
      )).ok;

      expect(
        (await h.transactions.get(t.id)).ok.amount.amount,
        Decimal.parse('20'),
      );
      expect(h.server.log.last, 'GET /transactions/${t.id}');
      final missing = await h.transactions.get('gone');
      expect(missing, isA<Failure<Transaction, AppError>>());
      expect(
        (missing as Failure<Transaction, AppError>).error.code,
        'TRANSACTION_NOT_FOUND',
      );

      await h.offline();
      h.server.unreachable = true;
      expect((await h.transactions.get(t.id)).ok.id, t.id);
      expect(
        (await h.transactions.get('never-cached')
                as Failure<Transaction, AppError>)
            .error,
        isA<NetworkError>(),
      );
    },
  );
}
