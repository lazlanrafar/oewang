import 'dart:convert';
import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_offline/contacts_repository_offline.dart';
import 'package:oewang/data/repositories_offline/debts_repository_offline.dart';
import 'package:oewang/data/repositories_offline/wallets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/contacts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/wallet.dart';

typedef Json = Map<String, dynamic>;

Decimal d(String s) => Decimal.parse(s);

/// The debts contract in memory (docs/api/endpoints.md#debts): client ids
/// on create (D114), payments that move a wallet and answer
/// `{payment, debt, transaction}`, and the API's refusals.
class FakeDebtsApi implements HttpClientAdapter {
  final wallets = <String, Json>{};
  final contacts = <String, Json>{};
  final debts = <String, Json>{};
  final payments = <String, Json>{};
  final log = <String>[];
  bool unreachable = false;
  bool loseNextResponse = false;
  var _clock = 0;

  String _now() =>
      '2026-11-24T00:00:00.${(++_clock).toString().padLeft(6, '0')}Z';

  void seedWallet(String id, String balance) => wallets[id] = {
    'id': id,
    'name': id,
    'balance': balance,
    'currency_code': 'IDR',
    'is_included_in_totals': true,
    'updated_at': _now(),
  };

  void seedContact(String id, String name) =>
      contacts[id] = {'id': id, 'name': name, 'updated_at': _now()};

  void seedDebt(
    String id,
    String contactId,
    String amount, {
    String type = 'receivable',
    String currency = 'IDR',
  }) => debts[id] = {
    'id': id,
    'contact_id': contactId,
    'contact_name': contacts[contactId]!['name'],
    'type': type,
    'currency_code': currency,
    'amount': amount,
    'remaining_amount': amount,
    'status': 'unpaid',
    'updated_at': _now(),
  };

  Decimal balanceOf(String id) => d(wallets[id]!['balance'] as String);

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (unreachable) {
      throw DioException.connectionError(requestOptions: o, reason: 'down');
    }
    final path = o.uri.path.replaceFirst('/v1', '');
    log.add('${o.method} $path');
    final answer = _handle(o.method, path, o);
    if (loseNextResponse) {
      loseNextResponse = false;
      throw DioException.connectionError(requestOptions: o, reason: 'lost');
    }
    return answer;
  }

  ResponseBody _handle(String method, String path, RequestOptions o) {
    final p = path.split('/').where((s) => s.isNotEmpty).toList();
    final body = o.data is Map ? Json.from(o.data as Map) : <String, dynamic>{};
    switch ((method, p)) {
      case ('GET', ['wallets']):
        return _ok(200, wallets.values.toList());
      case ('GET', ['contacts']):
        return _ok(200, contacts.values.toList());
      case ('POST', ['contacts']):
        final id = body['id'] as String;
        return _ok(201, contacts[id] ??= {...body, 'updated_at': _now()});
      case ('DELETE', ['contacts', final id]):
        if (debts.values.any((x) => x['contact_id'] == id)) {
          return _error(409, 'CONTACT_HAS_DEBTS', 'Contact has debts');
        }
        contacts.remove(id);
        return ResponseBody.fromString('', 204);
      case ('POST', ['contacts', final id, 'merge']):
        if (!contacts.containsKey(id)) {
          return _error(404, 'CONTACT_NOT_FOUND', 'Not found');
        }
        final into = contacts[body['into_id']]!;
        for (final x in debts.values) {
          if (x['contact_id'] == id) {
            x
              ..['contact_id'] = into['id']
              ..['contact_name'] = into['name'];
          }
        }
        contacts.remove(id);
        return _ok(200, into);
      case ('GET', ['debts']):
        return _ok(200, debts.values.toList());
      case ('GET', ['debts', 'summary']):
        return _ok(200, {
          'currency_code': 'IDR',
          'owed_to_you': '0',
          'you_owe': '0',
          'net': '0',
          'overdue_count': 0,
        });
      case ('GET', ['debts', final id]):
        return _ok(200, {
          ...debts[id]!,
          'payments': [
            for (final x in payments.values)
              if (x['debt_id'] == id) x,
          ],
        });
      case ('POST', ['debts']):
        final id = body['id'] as String;
        return _ok(
          201,
          debts[id] ??= {
            ...body,
            'contact_name': contacts[body['contact_id']]!['name'],
            'currency_code': 'IDR',
            'remaining_amount': body['amount'],
            'status': 'unpaid',
            'updated_at': _now(),
          },
        );
      case ('POST', ['debts', final debtId, 'payments']):
        return _pay(debtId, body);
      case ('DELETE', ['debts', final debtId, 'payments', final id]):
        final x = payments.remove(id);
        if (x == null) return _error(404, 'PAYMENT_NOT_FOUND', 'Not found');
        _move(debtId, x, -1);
        return ResponseBody.fromString('', 204);
    }
    throw StateError('unhandled $method $path');
  }

  ResponseBody _pay(String debtId, Json body) {
    final id = body['id'] as String;
    final debt = debts[debtId]!;
    if (payments[id] case final again?) {
      return _ok(200, {'payment': again, 'debt': debt, 'transaction': null});
    }
    final amount = d(body['amount'] as String);
    if (amount > d(debt['remaining_amount'] as String)) {
      return _error(422, 'PAYMENT_EXCEEDS_REMAINING', 'More than remaining');
    }
    final payment = {...body, 'debt_id': debtId};
    payments[id] = payment;
    final transaction = _move(debtId, payment, 1);
    return _ok(201, {
      'payment': payment,
      'debt': debt,
      'transaction': transaction,
    });
  }

  /// Applies ([sign] 1) or reverses (-1) a payment: the debt's remaining
  /// amount and status, and the wallet's balance. Answers the transaction.
  Json? _move(String debtId, Json payment, int sign) {
    final debt = debts[debtId]!;
    final amount = d(payment['amount'] as String);
    final remaining =
        d(debt['remaining_amount'] as String) - amount * Decimal.fromInt(sign);
    debt
      ..['remaining_amount'] = '$remaining'
      ..['status'] = DebtStatus.of(
        amount: d(debt['amount'] as String),
        remaining: remaining,
      ).name
      ..['updated_at'] = _now();
    final walletId = payment['wallet_id'] as String?;
    if (walletId == null) return null;
    final rate = payment['exchange_rate'] as String?;
    final walletAmount = amount * (rate == null ? Decimal.one : d(rate));
    final income = debt['type'] == 'receivable';
    final w = wallets[walletId]!;
    w['balance'] =
        '${balanceOf(walletId) + walletAmount * Decimal.fromInt(income ? sign : -sign)}';
    return {
      'id': 'tx-${payment['id']}',
      'type': income ? 'income' : 'expense',
      'amount': '$walletAmount',
      'wallet_id': walletId,
    };
  }

  ResponseBody _ok(int status, Object? data) => ResponseBody.fromString(
    jsonEncode({'data': data}),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  ResponseBody _error(int status, String code, String message) =>
      ResponseBody.fromString(
        jsonEncode({
          'data': null,
          'error': {'code': code, 'message': message},
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
  Harness() {
    final api = ApiClient(
      Dio(BaseOptions(baseUrl: 'http://fake/v1'))..httpClientAdapter = server,
    );
    sync = SyncService(
      db: db,
      api: api,
      workspaceId: () => 'ws1',
      canWrite: () => true,
    );
    debts = DebtsRepositoryOffline(
      remote: DebtsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
    contacts = ContactsRepositoryOffline(
      remote: ContactsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
    wallets = WalletsRepositoryOffline(
      remote: WalletsRepositoryRemote(api),
      api: api,
      sync: sync,
    );
  }

  final server = FakeDebtsApi();
  final db = AppDatabase(NativeDatabase.memory());
  late final SyncService sync;
  late final DebtsRepositoryOffline debts;
  late final ContactsRepositoryOffline contacts;
  late final WalletsRepositoryOffline wallets;

  Future<void> offline() async {
    sync.setOnline(online: false);
    await sync.drain();
  }

  Future<void> online() async {
    sync.setOnline(online: true);
    await sync.drain();
  }

  Future<List<QueueEntry>> queue() => db.entries('ws1');

  Future<Debt> debt(String id) async =>
      (await debts.list()).ok.firstWhere((x) => x.id == id);

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

NewDebtPayment payment(String amount, {String? walletId, String? rate}) =>
    NewDebtPayment(
      amount: d(amount),
      date: DateTime(2026, 11, 24),
      walletId: walletId,
      exchangeRate: rate == null ? null : d(rate),
    );

void main() {
  late Harness h;
  setUp(() {
    h = Harness();
    h.server
      ..seedWallet('w-bca', '1000')
      ..seedContact('c-budi', 'Budi')
      ..seedDebt('debt-1', 'c-budi', '300');
  });
  tearDown(() => h.dispose());

  test('MOB-10: a contact and a debt made offline replay in order under '
      'their client ids, and read back from the cache', () async {
    await h.debts.list(); // warm the cache while online
    await h.offline();
    final ani = (await h.contacts.create(name: 'Ani')).ok;
    final made = (await h.debts.create(
      NewDebtDraft(contactId: ani.id, type: DebtType.payable, amount: d('50')),
    )).ok;
    expect(made.contactName, 'Ani');
    expect(made.status, DebtStatus.unpaid);
    expect(h.server.log.where((l) => !l.startsWith('GET')), isEmpty);
    expect((await h.queue()).map((e) => '${e.op.name} ${e.kind}'), [
      'create contacts',
      'create debts',
    ]);

    await h.online();
    expect(await h.queue(), isEmpty);
    expect(h.server.contacts[ani.id]!['name'], 'Ani');
    expect(h.server.debts[made.id]!['contact_id'], ani.id);
  });

  test('MOB-10: a payment queued offline lowers the remaining amount '
      'and estimates the wallet, then lands once', () async {
    await h.debts.list();
    await h.wallets.list();
    await h.offline();

    (await h.debts.pay('debt-1', payment('100', walletId: 'w-bca'))).ok;
    final pending = await h.debt('debt-1');
    expect(pending.remainingAmount.amount, d('200'));
    expect(pending.status, DebtStatus.partial);
    final estimate = await h.wallet('w-bca');
    expect(estimate.balance, d('1100')); // a receivable paid in is income
    expect(estimate.balanceIsEstimate, isTrue);
    expect((await h.queue()).single.kind, 'debts/debt-1/payments');

    // The answer is lost on the way back: the replay repeats the same
    // client id and the API answers the payment it already has (D114).
    h.server.loseNextResponse = true;
    await h.online();
    await h.sync.drain();
    expect(await h.queue(), isEmpty);
    expect(h.server.payments, hasLength(1));
    expect(h.server.balanceOf('w-bca'), d('1100'));
    expect(
      h.server.log.where((l) => l == 'POST /debts/debt-1/payments'),
      hasLength(2),
    );
    final landed = await h.wallet('w-bca');
    expect(landed.balance, d('1100'));
    expect(landed.balanceIsEstimate, isFalse);
    expect((await h.debt('debt-1')).remainingAmount.amount, d('200'));
  });

  test('MOB-10: a queued payment in another currency estimates the '
      'wallet at the typed rate', () async {
    h.server.seedDebt(
      'debt-usd',
      'c-budi',
      '10',
      type: 'payable',
      currency: 'USD',
    );
    await h.debts.list();
    await h.wallets.list();
    await h.offline();
    (await h.debts.pay(
      'debt-usd',
      payment('10', walletId: 'w-bca', rate: '16250'),
    )).ok;
    expect((await h.wallet('w-bca')).balance, d('-161500')); // 1000 - 162500
    expect((await h.debt('debt-usd')).status, DebtStatus.paid);
  });

  test('MOB-10: cancelling a payment offline gives the amount back and '
      'reverses the wallet when it lands', () async {
    (await h.debts.pay('debt-1', payment('100', walletId: 'w-bca'))).ok;
    final paid = (await h.debts.payments('debt-1')).ok.single;
    expect(h.server.balanceOf('w-bca'), d('1100'));
    await h.wallets.list();

    await h.offline();
    (await h.debts.cancelPayment('debt-1', paid.id)).ok;
    expect((await h.debt('debt-1')).remainingAmount.amount, d('300'));
    expect((await h.debt('debt-1')).status, DebtStatus.unpaid);
    expect((await h.wallet('w-bca')).balance, d('1000'));
    expect((await h.debts.payments('debt-1')).ok, isEmpty);

    await h.online();
    expect(h.server.log.last, 'DELETE /debts/debt-1/payments/${paid.id}');
    expect(h.server.balanceOf('w-bca'), d('1000'));
    expect((await h.wallet('w-bca')).balance, d('1000'));
  });

  test('MOB-10: a replay the API refuses is a failed entry the person sees, '
      'and the next read takes the API figure back', () async {
    await h.debts.list();
    await h.offline();
    (await h.debts.pay('debt-1', payment('300'))).ok;
    // Partly paid on the web meanwhile.
    h.server.debts['debt-1']!['remaining_amount'] = '100';
    h.server.debts['debt-1']!['status'] = 'partial';

    await h.online();
    final issue = (await h.sync.issues()).single;
    expect(issue.status, QueueStatus.failed);
    expect(issue.error, 'More than remaining');
    await h.sync.discard(issue);
    expect(await h.queue(), isEmpty);
    final back = await h.debt('debt-1');
    expect(back.status, DebtStatus.partial);
    expect(back.remainingAmount.amount, d('100'));
  });

  test('MOB-10: a merge queued offline moves the cached debts at once '
      'and replays to the merge route', () async {
    h.server.seedContact('c-budi2', 'budi ');
    h.server.seedDebt('debt-2', 'c-budi2', '20');
    await h.debts.list();
    await h.contacts.list();
    await h.offline();

    (await h.contacts.merge(id: 'c-budi2', intoId: 'c-budi')).ok;
    expect((await h.debt('debt-2')).contactName, 'Budi');
    expect(
      (await h.contacts.list()).ok.map((c) => c.id),
      isNot(contains('c-budi2')),
    );

    await h.online();
    expect(h.server.log, contains('POST /contacts/c-budi2/merge'));
    expect(h.server.debts['debt-2']!['contact_id'], 'c-budi');
    expect(await h.queue(), isEmpty);
  });

  test(
    'MOB-10: deleting a contact with debts is refused while online',
    () async {
      final res = await h.contacts.delete('c-budi');
      expect(res, isA<Failure<void, AppError>>());
      expect((res as Failure<void, AppError>).error.code, 'CONTACT_HAS_DEBTS');
    },
  );
}
