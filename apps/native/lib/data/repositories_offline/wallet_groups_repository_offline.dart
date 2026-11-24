import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/wallet_group_dto.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/wallet_group.dart';

const _kind = 'wallet_groups';

/// Groups from the cache when offline, so the account form can still pick
/// one and a wallet can be made offline (MOB-6). Group writes need a
/// connection.
class WalletGroupsRepositoryOffline implements WalletGroupsRepository {
  WalletGroupsRepositoryOffline({
    required WalletGroupsRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final WalletGroupsRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  @override
  Future<Result<List<WalletGroup>, AppError>> list() async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list();
    final error = await _sync.pull(_kind, () async {
      final data = envelopeData(await _api.get('/wallet-groups'));
      return [for (final r in (data as List?) ?? const []) r as Json];
    });
    if (error != null) return Failure(error);
    return Success([
      for (final r in await _sync.db.rows(ws, _kind))
        WalletGroupDto.fromJson(r).toDomain(),
    ]);
  }

  @override
  Future<Result<WalletGroup, AppError>> create({required String name}) =>
      _remote.create(name: name);

  @override
  Future<Result<WalletGroup, AppError>> update({
    required String id,
    required String name,
  }) => _remote.update(id: id, name: name);

  @override
  Future<Result<void, AppError>> delete(String id) => _remote.delete(id);

  @override
  Future<Result<void, AppError>> reorder(List<String> orderedIds) =>
      _remote.reorder(orderedIds);
}
