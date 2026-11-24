import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';

class FeedbackRepositoryRemote implements FeedbackRepository {
  FeedbackRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<void, AppError>> submit({
    required FeedbackType type,
    required String message,
  }) async {
    try {
      await _api.post(
        '/feedback',
        data: {'type': _typeToApi(type), 'message': message},
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  String _typeToApi(FeedbackType type) => switch (type) {
    FeedbackType.bug => 'bug',
    FeedbackType.featureRequest => 'feature',
    FeedbackType.other => 'other',
  };
}
