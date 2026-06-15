import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/wallet_group_dto.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class WalletGroupsRepositoryRemote implements WalletGroupsRepository {
  WalletGroupsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<WalletGroup>, AppError>> list() async {
    try {
      final res = await _api.get('/wallet-groups');
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! List) return const Success<List<WalletGroup>, AppError>([]);
      return Success(
        data
            .whereType<Map<String, dynamic>>()
            .map(WalletGroupDto.fromJson)
            .map((d) => d.toDomain())
            .toList(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
