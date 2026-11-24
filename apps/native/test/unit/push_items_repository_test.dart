import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/vault_repository_remote.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/vault_file.dart';

import '../support/fake_owe1_api.dart';
import 'transaction_dto_test.dart' show view;

/// One row read by id, or the API's `404` for a deleted or unknown one.
FakeOwe1Api _server(String path, Object? row, {required String missing}) =>
    FakeOwe1Api(
      (api, req) => req.method == 'GET' && req.path == path
          ? api.envelope(req, row)
          : api.envelope(req, null, status: 404, code: missing),
    );

int? _status(Result<Object?, AppError> res) => switch (res) {
  Failure(error: ServerError(:final statusCode)) => statusCode,
  _ => null,
};

void main() {
  group('PUSH-5 transactions get(id)', () {
    test('remote reads GET /v1/transactions/{id}', () async {
      final server = _server('/v1/transactions/t-1', {
        ...view(),
        'items': <Object>[],
        'attachments': <Object>[],
      }, missing: 'TRANSACTION_NOT_FOUND');
      final repo = TransactionsRepositoryRemote(server.client());

      final res = await repo.get('t-1');

      final t = (res as Success<Transaction, AppError>).value;
      expect(t.id, 't-1');
      expect(t.amount.amount, Decimal.parse('50000'));
      expect(_status(await repo.get('gone')), 404);
    });

    test('fake finds a seeded row and 404s an unknown one', () async {
      final row = Transaction(
        id: 't-1',
        type: TransactionType.expense,
        amount: Money(amount: Decimal.one, currency: 'IDR'),
        date: DateTime(2026, 11),
        walletId: 'w',
      );
      final repo = TransactionsRepositoryFake(seed: [row]);

      expect((await repo.get('t-1')).fold((t) => t.id, (e) => e), 't-1');
      expect(_status(await repo.get('nope')), 404);
    });
  });

  group('PUSH-5 vault get(id)', () {
    test('remote reads GET /v1/vault/files/{id}', () async {
      final server = _server('/v1/vault/files/f-1', {
        'id': 'f-1',
        'name': 'receipt.jpg',
        'type': 'image/jpeg',
        'size': 2048,
        'tags': <String>[],
        'thumbnail': true,
        'used_by': 1,
        'transactions': <Object>[],
        'created_at': '2026-11-23T00:00:00Z',
      }, missing: 'FILE_NOT_FOUND');
      final repo = VaultRepositoryRemote(server.client());

      final file =
          (await repo.get('f-1') as Success<VaultFile, AppError>).value;
      expect(file.name, 'receipt.jpg');
      expect(file.usedBy, 1);
      expect(_status(await repo.get('gone')), 404);
    });

    test('fake finds a stored file and 404s an unknown one', () async {
      final repo = VaultRepositoryFake([const VaultFile(id: 'f-1')]);

      expect((await repo.get('f-1')).fold((f) => f.id, (e) => e), 'f-1');
      expect(_status(await repo.get('nope')), 404);
    });
  });
}
