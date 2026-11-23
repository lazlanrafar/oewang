import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/wallet_dto.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/wallet.dart';

/// `/v1/wallets*`. Balances are never written: the form's amount goes
/// through [adjust] (TXN-3).
class WalletsRepositoryRemote implements WalletsRepository {
  WalletsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Wallet>, AppError>> list() async {
    try {
      final data = envelopeData(await _api.get('/wallets'));
      return Success([
        for (final row in (data as List?) ?? const [])
          WalletDto.fromJson(row as Map<String, dynamic>).toDomain(),
      ]);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) => _wallet(
    () => _api.post(
      '/wallets',
      data: {
        'name': draft.name,
        'group_id': draft.groupId,
        if (draft.currencyCode != null) 'currency_code': draft.currencyCode,
      },
    ),
  );

  @override
  Future<Result<Wallet, AppError>> update(String id, NewWalletDraft draft) =>
      _wallet(
        () => _api.patch(
          '/wallets/$id',
          data: {
            'name': draft.name,
            // An explicit null detaches the wallet from its group.
            'group_id': draft.groupId,
            if (draft.currencyCode != null) 'currency_code': draft.currencyCode,
          },
        ),
      );

  @override
  Future<Result<Wallet, AppError>> adjust(String id, Decimal balance) =>
      _wallet(
        () => _api.post(
          '/wallets/$id/adjust',
          data: {'balance': balance.toString()},
        ),
      );

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/wallets/$id');
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  }) async {
    final res = await _wallet(
      () =>
          _api.patch('/wallets/$id', data: {'is_included_in_totals': included}),
    );
    return res.fold(
      (_) => const Success<void, AppError>(null),
      Failure<void, AppError>.new,
    );
  }

  Future<Result<Wallet, AppError>> _wallet(
    Future<Response<dynamic>> Function() send,
  ) async {
    try {
      final data = envelopeData(await send());
      return Success(
        WalletDto.fromJson(data! as Map<String, dynamic>).toDomain(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
