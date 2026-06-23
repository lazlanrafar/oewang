import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/session.dart';

/// Abstract repository for authentication. ViewModels depend on this type only.
abstract class AuthRepository {
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  });

  /// Calls POST /auth/register, persists the returned token (same shape as
  /// login). `workspaceId` is null for brand-new users — onboarding creates it.
  Future<Result<Session, AppError>> register({
    required String name,
    required String email,
    required String password,
  });

  Future<Session?> currentSession();

  /// Calls POST /auth/refresh to mint a JWT with the freshest workspace_id +
  /// roles. Persists the new token in secure storage. Used after switching
  /// workspaces.
  Future<Result<Session, AppError>> refreshToken();

  Future<void> logout();
}
