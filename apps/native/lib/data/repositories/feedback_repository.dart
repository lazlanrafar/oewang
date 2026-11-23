import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

enum FeedbackType { bug, featureRequest, other }

abstract class FeedbackRepository {
  /// `POST /v1/feedback` (FB-1). Identity comes from the JWT; the API takes
  /// a type and a message of 5000 characters at most, and no attachment.
  Future<Result<void, AppError>> submit({
    required FeedbackType type,
    required String message,
  });
}
