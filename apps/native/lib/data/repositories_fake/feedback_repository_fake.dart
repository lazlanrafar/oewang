import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';

class FeedbackRepositoryFake implements FeedbackRepository {
  @override
  Future<Result<void, AppError>> submit({
    required FeedbackType type,
    required String message,
    File? screenshot,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return const Success(null);
  }
}
