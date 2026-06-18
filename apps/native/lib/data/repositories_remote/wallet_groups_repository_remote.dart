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

  @override
  Future<Result<WalletGroup, AppError>> create({required String name}) async {
    try {
      final res = await _api.post('/wallet-groups', data: {'name': name});
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected response'),
        );
      }
      return Success(WalletGroupDto.fromJson(json).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<WalletGroup, AppError>> update({
    required String id,
    required String name,
  }) async {
    try {
      final res = await _api.put('/wallet-groups/$id', data: {'name': name});
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected response'),
        );
      }
      return Success(WalletGroupDto.fromJson(json).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/wallet-groups/$id');
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> reorder(List<String> orderedIds) async {
    try {
      await _api.put(
        '/wallet-groups/reorder',
        data: {
          'updates': [
            for (var i = 0; i < orderedIds.length; i++)
              {'id': orderedIds[i], 'sortOrder': i},
          ],
        },
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
