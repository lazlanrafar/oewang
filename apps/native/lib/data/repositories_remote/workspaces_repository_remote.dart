import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/workspace_dto.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class WorkspacesRepositoryRemote implements WorkspacesRepository {
  WorkspacesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<WorkspaceMembership>, AppError>> list() async {
    try {
      final data = envelopeData(await _api.get('/workspaces'));
      return Success([
        for (final row in (data as List?) ?? const [])
          WorkspaceDto.fromJson(row as Map<String, dynamic>).toMembership(),
      ]);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Workspace, AppError>> create({
    required String name,
    required String currencyCode,
  }) async {
    try {
      final data = envelopeData(
        await _api.post(
          '/workspaces',
          data: {'name': name, 'currency_code': currencyCode},
        ),
      );
      return Success(
        WorkspaceDto.fromJson(data! as Map<String, dynamic>).toDomain(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Workspace, AppError>> current() async {
    try {
      final data =
          envelopeData(await _api.get('/workspaces/current'))!
              as Map<String, dynamic>;
      return Success(WorkspaceDto.fromJson(data).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> setCurrency(String currencyCode) => _void(
    () => _api.patch(
      '/workspaces/current',
      data: {'currency_code': currencyCode},
    ),
  );

  @override
  Future<Result<CurrencyPreview, AppError>> previewConversion(String to) async {
    try {
      final m =
          envelopeData(
                await _api.get(
                  '/workspaces/current/currency/preview',
                  queryParameters: {'to': to},
                ),
              )!
              as Map<String, dynamic>;
      final rate = m['suggested_rate'] as String?;
      return Success(
        CurrencyPreview(
          from: m['from'] as String,
          to: m['to'] as String,
          suggestedRate: rate == null ? null : Decimal.parse(rate),
          transactions: (m['transactions'] as num).toInt(),
          budgets: (m['budgets'] as num).toInt(),
        ),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> convertCurrency({
    required String currencyCode,
    required Decimal rate,
  }) => _void(
    () => _api.post(
      '/workspaces/current/currency/convert',
      data: {'currency_code': currencyCode, 'rate': rate.toString()},
    ),
  );

  @override
  Future<Result<List<WorkspaceMember>, AppError>> members() async {
    try {
      final data = envelopeData(await _api.get('/workspaces/current/members'));
      return Success([
        for (final row in (data as List?) ?? const [])
          WorkspaceMember(
            userId: (row as Map<String, dynamic>)['user_id'] as String,
            email: row['email'] as String? ?? '',
            name: row['name'] as String?,
            role: row['role'] as String? ?? 'member',
          ),
      ]);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  Future<Result<void, AppError>> _void(
    Future<Response<dynamic>> Function() send,
  ) async {
    try {
      await send();
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
