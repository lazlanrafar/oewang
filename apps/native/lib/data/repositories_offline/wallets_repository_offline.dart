import 'package:cuid2/cuid2.dart';
import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/wallet_dto.dart';
import 'package:oewang/data/dto/wallet_totals_dto.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

const _kind = 'wallets';

/// Wallets from the cache when offline, written through the queue (MOB-6).
/// A balance with queued transactions behind it is an estimate.
class WalletsRepositoryOffline implements WalletsRepository {
  WalletsRepositoryOffline({
    required WalletsRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final WalletsRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  AppDatabase get _db => _sync.db;

  @override
  Future<Result<List<Wallet>, AppError>> list() async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list();
    final error = await _sync.pull(_kind, () async {
      final data = envelopeData(await _api.get('/wallets'));
      return [for (final r in (data as List?) ?? const []) r as Json];
    });
    if (error != null) return Failure(error);
    final deltas = await _sync.pendingBalanceDeltas(ws);
    return Success([
      for (final r in await _db.rows(ws, _kind)) _toDomain(r, deltas),
    ]);
  }

  /// The API's answer, kept as sent; offline, the last one kept. Either is
  /// an estimate while transaction or wallet writes are still queued, since
  /// the API has not seen them.
  // shortcut: queued deltas are not added to the cached totals, only
  // flagged; add them if a stale offline total confuses anyone.
  @override
  Future<Result<WalletTotals, AppError>> totals() async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.totals();
    if (_sync.online) {
      try {
        final data = envelopeData(await _api.get('/wallets/totals'));
        await _db.putRow(ws, 'meta', {...data! as Json, 'id': _totalsId});
      } on DioException catch (e) {
        final error = mapDioError(e);
        if (error is! NetworkError) return Failure(error);
      }
    }
    final cached = await _db.row(ws, 'meta', _totalsId);
    if (cached == null) return const Failure(NetworkError());
    final queued = (await _db.entries(
      ws,
    )).any((e) => e.isPending && (e.kind == 'transactions' || e.kind == _kind));
    return Success(walletTotalsFromJson(cached, isEstimate: queued));
  }

  static const _totalsId = 'wallet-totals';

  static Wallet _toDomain(Json row, Map<String, Decimal> deltas) {
    final w = WalletDto.fromJson(row);
    final delta = deltas[w.id];
    return Wallet(
      id: w.id,
      name: w.name,
      groupId: w.groupId,
      balance: w.balance + (delta ?? Decimal.zero),
      currency: w.currency,
      isIncludedInTotals: w.isIncludedInTotals,
      // A wallet made on this device has no API figure yet.
      balanceIsEstimate: delta != null || row['updated_at'] == null,
    );
  }

  /// The opening balance is not part of the body: the form sends it through
  /// [adjust] once the wallet exists (TXN-3).
  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) async {
    final id = cuid();
    final body = {
      'id': id,
      'name': draft.name,
      'group_id': draft.groupId,
      if (draft.currencyCode != null) 'currency_code': draft.currencyCode,
    };
    return _write(QueueOp.create, id, body, {
      'is_included_in_totals': true,
      'is_default': false,
      'sort_order': 0,
      ...body,
    });
  }

  @override
  Future<Result<Wallet, AppError>> update(String id, NewWalletDraft draft) =>
      _patch(id, {
        'name': draft.name,
        'group_id': draft.groupId,
        if (draft.currencyCode != null) 'currency_code': draft.currencyCode,
      });

  /// Needs a connection, and the wallet on the API: the difference is a
  /// transaction the API works out from its own balance.
  // shortcut: a wallet created while offline gets its balance on the next
  // save once the queue has sent it; queue the adjustment if that bites.
  @override
  Future<Result<Wallet, AppError>> adjust(String id, Decimal balance) async {
    if (!_sync.online) {
      return const Failure(
        NetworkError('Setting a balance needs a connection'),
      );
    }
    return _remote.adjust(id, balance);
  }

  @override
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  }) => _patch(id, {'is_included_in_totals': included});

  Future<Result<Wallet, AppError>> _patch(String id, Json body) async {
    final ws = _sync.workspaceId;
    final before = ws == null ? null : await _db.row(ws, _kind, id);
    return _write(QueueOp.update, id, body, {...?before, ...body, 'id': id});
  }

  Future<Result<Wallet, AppError>> _write(
    QueueOp op,
    String id,
    Json body,
    Json optimistic,
  ) async {
    final ws = _sync.workspaceId;
    final deltas = ws == null
        ? const <String, Decimal>{}
        : await _sync.pendingBalanceDeltas(ws);
    return _sync
        .write(
          kind: _kind,
          op: op,
          entityId: id,
          payload: body,
          optimistic: {
            'currency_code': await _currency(),
            'balance': '0',
            ...optimistic,
          },
        )
        .mapRow((row) => _toDomain(row!, deltas));
  }

  /// What a wallet made offline is held in until the API names it: the
  /// workspace currency, as last seen.
  Future<String> _currency() async {
    final ws = _sync.workspaceId;
    final meta = ws == null ? null : await _db.row(ws, 'meta', 'currency');
    return meta?['code'] as String? ?? 'IDR';
  }

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _sync.write(kind: _kind, op: QueueOp.delete, entityId: id).mapRow((_) {});
}
