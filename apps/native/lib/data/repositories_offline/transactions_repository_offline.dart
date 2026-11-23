import 'package:cuid2/cuid2.dart';
import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

const _kind = 'transactions';

/// Transactions that read from the cache when offline and write through the
/// queue (MOB-6). Summary falls back to the cache; everything else is the
/// remote repository's.
class TransactionsRepositoryOffline implements TransactionsRepository {
  TransactionsRepositoryOffline({
    required TransactionsRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final TransactionsRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  AppDatabase get _db => _sync.db;

  static String _day(DateTime d) => TransactionDto.dayFormat.format(d);

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list(query);
    final from = _day(query.from);
    final to = _day(query.to);
    // Whole months are what the month screens read, so only they are kept;
    // any other range reads the API, or whatever months are cached.
    final month =
        query.type == null &&
        query.from.day == 1 &&
        DateTime(query.from.year, query.from.month + 1, 0) == query.to;
    if (!month && _sync.online) {
      final res = await _remote.list(query);
      if (res case Failure(error: NetworkError())) {
      } else {
        return res;
      }
    }
    if (month && query.page == 1) {
      final error = await _sync.pull(
        _kind,
        () => _fetchAll(from, to),
        from: from,
        to: to,
      );
      if (error != null) return Failure(error);
    }
    final rows = (await _db.rows(ws, _kind, from: from, to: to))
        .where((r) => query.type == null || r['type'] == query.type!.wire)
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
    return Success([
      for (final r in rows) TransactionDto.fromJson(r).toDomain(),
    ]);
  }

  /// Every page of the range, as the API sent them.
  Future<List<Json>> _fetchAll(String from, String to) async {
    const limit = 100;
    final out = <Json>[];
    // The month controller's cap: 2,000 rows.
    for (var page = 1; page <= 20; page++) {
      final data = envelopeData(
        await _api.get(
          '/transactions',
          queryParameters: {
            'start_date': from,
            'end_date': to,
            'limit': limit,
            'page': page,
          },
        ),
      );
      final batch = [for (final r in (data as List?) ?? const []) r as Json];
      out.addAll(batch);
      if (batch.length < limit) break;
    }
    return out;
  }

  @override
  Future<Result<TransactionsSummary, AppError>> summary({
    required DateTime from,
    required DateTime to,
  }) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.summary(from: from, to: to);
    if (_sync.online) {
      final res = await _remote.summary(from: from, to: to);
      switch (res) {
        case Success(:final value):
          await _db.putRow(ws, 'meta', {
            'id': 'currency',
            'code': value.currency,
          });
          return res;
        case Failure(error: NetworkError()):
          break;
        case Failure():
          return res;
      }
    }
    // Offline: the cached rows' base amounts, which a queued row holds as
    // its own amount until it syncs.
    final currency = (await _db.row(ws, 'meta', 'currency'))?['code'];
    if (currency is! String) return const Failure(NetworkError());
    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final r in await _db.rows(ws, _kind, from: _day(from), to: _day(to))) {
      final base = Decimal.parse(r['base_amount'] as String);
      if (r['type'] == 'income') income += base;
      if (r['type'] == 'expense') expense += base;
    }
    return Success(
      TransactionsSummary(
        currency: currency,
        income: Money(amount: income, currency: currency),
        expense: Money(amount: expense, currency: currency),
      ),
    );
  }

  @override
  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft) {
    final id = cuid();
    return _write(QueueOp.create, id, {
      ...TransactionDto.body(draft),
      'id': id,
    });
  }

  @override
  Future<Result<Transaction, AppError>> update(
    String id,
    NewTransactionDraft draft,
  ) => _write(QueueOp.update, id, TransactionDto.body(draft));

  Future<Result<Transaction, AppError>> _write(
    QueueOp op,
    String id,
    Json body,
  ) async {
    final ws = _sync.workspaceId;
    if (ws == null) return const Failure(UnknownError('No workspace'));
    return _sync
        .write(
          kind: _kind,
          op: op,
          entityId: id,
          payload: body,
          optimistic: await _optimistic(ws, id, body),
        )
        .mapRow((row) => TransactionDto.fromJson(row!).toDomain());
  }

  /// The row as it will read once the API has it, so far as the device can
  /// tell: names from the cached wallets and category.
  Future<Json> _optimistic(String ws, String id, Json body) async {
    Future<Json?> named(String kind, Object? ref) async =>
        ref is String ? _db.row(ws, kind, ref) : null;
    final before = await _db.row(ws, _kind, id);
    final wallet = await named('wallets', body['wallet_id']);
    return {
      ...?before,
      ...body,
      'id': id,
      'wallet_name': wallet?['name'] ?? '',
      'wallet_currency_code':
          wallet?['currency_code'] ?? before?['wallet_currency_code'] ?? '',
      'to_wallet_name': (await named('wallets', body['to_wallet_id']))?['name'],
      'category_name': (await named(
        'categories',
        body['category_id'],
      ))?['name'],
      // shortcut: the API converts to the workspace currency; a queued row
      // counts its own amount until it syncs.
      'base_amount': body['amount'],
    };
  }

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _sync.write(kind: _kind, op: QueueOp.delete, entityId: id).mapRow((_) {});
}
