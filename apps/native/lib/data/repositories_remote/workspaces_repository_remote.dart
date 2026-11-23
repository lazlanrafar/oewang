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
}
