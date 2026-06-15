import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/wallet_dto.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/wallet.dart';

class WalletsRepositoryRemote implements WalletsRepository {
  WalletsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Wallet>, AppError>> list() async {
    try {
      final res = await _api.get('/wallets', queryParameters: {'limit': 100});
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! List) return const Success<List<Wallet>, AppError>([]);
      final wallets = data
          .whereType<Map<String, dynamic>>()
          .map(WalletDto.fromJson)
          .map((dto) => dto.toDomain())
          .toList();
      return Success(wallets);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) async {
    try {
      final res = await _api.post(
        '/wallets',
        data: {
          'name': draft.name,
          if (draft.groupId != null) 'groupId': draft.groupId,
          'balance': draft.balance.toString(),
        },
      );
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected create response'),
        );
      }
      return Success(WalletDto.fromJson(json).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
