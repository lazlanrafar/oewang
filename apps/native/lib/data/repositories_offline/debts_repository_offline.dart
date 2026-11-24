import 'package:cuid2/cuid2.dart';
import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/debt_dto.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/debt.dart';

const _kind = 'debts';
const _summaryId = 'debt-summary';

/// Whether [e] is a debt, payment or contact write still owed to the API.
bool isDebtWrite(QueueEntry e) =>
    e.isPending &&
    (e.kind == _kind ||
        e.kind == 'contacts' ||
        paymentDebtId(e.kind) != null ||
        isMergeKind(e.kind));

/// Debts from the cache when offline, written through the queue (MOB-10).
/// A payment queued offline lowers the cached remaining amount at once and
/// adds its wallet delta to the balance estimate (SyncService).
class DebtsRepositoryOffline implements DebtsRepository {
  DebtsRepositoryOffline({
    required DebtsRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final DebtsRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  AppDatabase get _db => _sync.db;

  /// While debt writes are queued the cache is ahead of the API: a refresh
  /// would put back figures the queue is about to change.
  Future<bool> _queued(String ws) async =>
      (await _db.entries(ws)).any(isDebtWrite);

  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list(search: search);
    if (!await _queued(ws)) {
      // Every debt, so the cache holds them all; the search runs locally.
      final error = await _sync.pull(
        _kind,
        () => fetchAllPages(
          _api,
          '/debts',
          query: {'today': dayWire(DateTime.now())},
        ),
      );
      if (error != null) return Failure(error);
    }
    final q = search?.trim().toLowerCase() ?? '';
    return Success([
      for (final r in await _db.rows(ws, _kind))
        if (q.isEmpty ||
            '${r['contact_name']} ${r['description'] ?? ''}'
                .toLowerCase()
                .contains(q))
          debtFromJson(r),
    ]);
  }

  @override
  Future<Result<DebtSummary, AppError>> summary() async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.summary();
    if (_sync.online && !await _queued(ws)) {
      try {
        final data = envelopeData(
          await _api.get(
            '/debts/summary',
            queryParameters: {'today': dayWire(DateTime.now())},
          ),
        );
        await _db.putRow(ws, 'meta', {...data! as Json, 'id': _summaryId});
      } on DioException catch (e) {
        final error = mapDioError(e);
        if (error is! NetworkError) return Failure(error);
      }
    }
    // Offline, or queued: the last figures the API gave, never a sum made
    // here across currencies (D27).
    final cached = await _db.row(ws, 'meta', _summaryId);
    if (cached == null) return const Failure(NetworkError());
    return Success(debtSummaryFromJson(cached));
  }

  @override
  Future<Result<List<DebtPayment>, AppError>> payments(String debtId) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.payments(debtId);
    final kind = paymentKind(debtId);
    if (!await _queued(ws)) {
      final error = await _sync.pull(kind, () async {
        final debt = envelopeData(await _api.get('/debts/$debtId'))! as Json;
        return [
          for (final p in (debt['payments'] as List?) ?? const [])
            {'debt_id': debtId, ...p as Json},
        ];
      });
      if (error != null) return Failure(error);
    }
    final currency = await _currencyOf(ws, debtId);
    return Success([
      for (final r in await _db.rows(ws, kind))
        debtPaymentFromJson(r, currency: currency),
    ]);
  }

  @override
  Future<Result<Debt, AppError>> create(NewDebtDraft draft) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.create(draft);
    final id = cuid();
    final body = {'id': id, ...debtBody(draft)};
    final contact = await _db.row(ws, 'contacts', draft.contactId);
    final currency =
        draft.currency ??
        (await _db.row(ws, 'meta', 'currency'))?['code'] as String? ??
        'IDR';
    return _write(QueueOp.create, id, body, {
      ...body,
      'contact_name': contact?['name'] ?? '',
      'currency_code': currency,
      'remaining_amount': body['amount'],
      'status': 'unpaid',
    });
  }

  @override
  Future<Result<Debt, AppError>> update({
    required String id,
    String? contactId,
    Decimal? amount,
    String? description,
    DateTime? dueDate,
  }) async {
    final ws = _sync.workspaceId;
    if (ws == null) {
      return _remote.update(
        id: id,
        contactId: contactId,
        amount: amount,
        description: description,
        dueDate: dueDate,
      );
    }
    final before = await _db.row(ws, _kind, id);
    final body = debtPatch(
      contactId: contactId,
      amount: amount,
      description: description,
      dueDate: dueDate,
    );
    final optimistic = <String, dynamic>{...?before, ...body, 'id': id};
    if (before != null && amount != null) {
      // The paid part stays paid; the API refuses an amount below it.
      final paid =
          Decimal.parse(before['amount'] as String) -
          Decimal.parse(before['remaining_amount'] as String);
      _setRemaining(optimistic, amount - paid);
    }
    if (contactId != null) {
      optimistic['contact_name'] =
          (await _db.row(ws, 'contacts', contactId))?['name'] ??
          before?['contact_name'];
    }
    return _write(QueueOp.update, id, body, optimistic);
  }

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _sync.write(kind: _kind, op: QueueOp.delete, entityId: id).mapRow((_) {});

  @override
  Future<Result<void, AppError>> pay(
    String debtId,
    NewDebtPayment payment,
  ) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.pay(debtId, payment);
    final id = cuid();
    final body = {'id': id, ...paymentBody(payment)};
    final res = await _sync.write(
      kind: paymentKind(debtId),
      op: QueueOp.create,
      entityId: id,
      payload: body,
      optimistic: {...body, 'debt_id': debtId},
    );
    if (res is Success && await _isQueued(ws, id)) {
      await _moveRemaining(ws, debtId, -payment.amount);
    }
    return res.discard();
  }

  @override
  Future<Result<void, AppError>> cancelPayment(
    String debtId,
    String paymentId,
  ) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.cancelPayment(debtId, paymentId);
    final kind = paymentKind(debtId);
    final payment = await _db.row(ws, kind, paymentId);
    final res = await _sync.write(
      kind: kind,
      op: QueueOp.delete,
      entityId: paymentId,
    );
    if (res is Success && payment != null && await _isQueued(ws, paymentId)) {
      await _moveRemaining(
        ws,
        debtId,
        Decimal.parse(payment['amount'] as String),
      );
    }
    return res.discard();
  }

  Future<bool> _isQueued(String ws, String entityId) async =>
      (await _db.entries(ws)).any((e) => e.entityId == entityId);

  /// Moves the cached remaining amount by [delta] and derives the status as
  /// the API does (DEBT-2), until the queue lands the API's figure.
  Future<void> _moveRemaining(String ws, String debtId, Decimal delta) async {
    final debt = await _db.row(ws, _kind, debtId);
    if (debt == null) return;
    final next = {...debt};
    _setRemaining(
      next,
      Decimal.parse(debt['remaining_amount'] as String) + delta,
    );
    await _db.putRow(ws, _kind, next);
  }

  static void _setRemaining(Json debt, Decimal remaining) {
    final amount = Decimal.parse(debt['amount'] as String);
    debt
      ..['remaining_amount'] = '$remaining'
      ..['status'] = DebtStatus.of(amount: amount, remaining: remaining).name;
  }

  Future<String> _currencyOf(String ws, String debtId) async =>
      (await _db.row(ws, _kind, debtId))?['currency_code'] as String? ?? 'IDR';

  Future<Result<Debt, AppError>> _write(
    QueueOp op,
    String id,
    Json body,
    Json optimistic,
  ) => _sync
      .write(
        kind: _kind,
        op: op,
        entityId: id,
        payload: body,
        optimistic: optimistic,
      )
      .mapRow((row) => debtFromJson(row!));
}
