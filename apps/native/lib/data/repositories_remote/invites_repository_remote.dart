import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/invites_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';

class InvitesRepositoryRemote implements InvitesRepository {
  InvitesRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<String, AppError>> accept(String token) async {
    try {
      final data = envelopeData(
        await _api.post('/workspaces/accept-invite', data: {'token': token}),
      );
      final id = data is Map ? data['workspace_id'] : null;
      return id is String
          ? Success(id)
          : const Failure(UnknownError('Unexpected invite response'));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
