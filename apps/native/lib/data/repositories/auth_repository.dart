import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/session.dart';

/// Abstract repository for authentication. ViewModels depend on this type only.
abstract class AuthRepository {
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  });

  Future<Session?> currentSession();

  Future<void> logout();
}
