import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/workspace.dart';

/// Abstract repository for workspace creation during onboarding.
abstract class WorkspacesRepository {
  Future<Result<Workspace, AppError>> create({
    required String name,
    String? country,
    String? mainCurrencyCode,
    String? mainCurrencySymbol,
  });
}
