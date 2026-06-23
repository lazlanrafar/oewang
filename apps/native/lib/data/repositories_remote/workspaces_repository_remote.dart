import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/workspace_dto.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/workspace.dart';

class WorkspacesRepositoryRemote implements WorkspacesRepository {
  WorkspacesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<Workspace, AppError>> create({
    required String name,
    String? country,
    String? mainCurrencyCode,
    String? mainCurrencySymbol,
  }) async {
    try {
      final res = await _api.post('/workspaces', data: {
        'name': name,
        if (country != null) 'country': country,
        if (mainCurrencyCode != null) 'mainCurrencyCode': mainCurrencyCode,
        if (mainCurrencySymbol != null) 'mainCurrencySymbol': mainCurrencySymbol,
      });
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected create response'),
        );
      }
      return Success(WorkspaceDto.fromJson(json).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
