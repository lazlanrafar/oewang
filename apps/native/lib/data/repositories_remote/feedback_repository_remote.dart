import 'dart:io';

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
    File? screenshot,
  }) async {
    try {
      final formData = FormData.fromMap({
        'type': _typeToApi(type),
        'message': message,
        if (screenshot != null)
          'file': await MultipartFile.fromFile(screenshot.path),
      });
      await _api.post('/feedback', data: formData);
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  String _typeToApi(FeedbackType type) => switch (type) {
    FeedbackType.bug => 'bug',
    FeedbackType.featureRequest => 'feature_request',
    FeedbackType.other => 'other',
  };
}
