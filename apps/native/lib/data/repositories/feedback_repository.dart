import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

enum FeedbackType { bug, featureRequest, other }

abstract class FeedbackRepository {
  /// Submits a bug report / feature request. Identity comes from the JWT the
  /// caller is already authenticated with — no separate contact fields.
  Future<Result<void, AppError>> submit({
    required FeedbackType type,
    required String message,
    File? screenshot,
  });
}
