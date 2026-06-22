import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/debt_dto.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/debt.dart';

class DebtsRepositoryRemote implements DebtsRepository {
  DebtsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) async {
    try {
      final res = await _api.get(
        '/debts',
        queryParameters: {
          'limit': 1000,
          if (search != null && search.isNotEmpty) 'search': search,
        },
      );
      final body = res.data;
      final data = body is Map<String, dynamic> ? body['data'] : null;
      if (data is! List) return const Success<List<Debt>, AppError>([]);
      final debts = data
          .whereType<Map<String, dynamic>>()
          .map(DebtDto.fromJson)
          .map((d) => d.toDomain())
          .toList();
      return Success(debts);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> create({
    required String contactId,
    required DebtType type,
    required num amount,
    String? description,
    DateTime? dueDate,
  }) async {
    try {
      await _api.post(
        '/debts',
        data: {
          'contactId': contactId,
          'type': type.wire,
          'amount': amount,
          if (description != null && description.isNotEmpty)
            'description': description,
          if (dueDate != null) 'dueDate': dueDate.toIso8601String(),
        },
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> update({
    required String id,
    num? amount,
    String? description,
    DateTime? dueDate,
  }) async {
    try {
      await _api.patch(
        '/debts/$id',
        data: {
          if (amount != null) 'amount': amount,
          if (description != null) 'description': description,
          if (dueDate != null) 'dueDate': dueDate.toIso8601String(),
        },
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/debts/$id');
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> pay({
    required String id,
    required num amount,
    String? walletId,
  }) async {
    try {
      await _api.post(
        '/debts/$id/pay',
        data: {'amount': amount, if (walletId != null) 'walletId': walletId},
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
