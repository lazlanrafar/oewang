import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/session.dart';

/// Abstract repository for authentication. ViewModels depend on this type only.
abstract class AuthRepository {
  /// `POST /v1/auth/login`. The session is scoped to the first workspace the
  /// user joined, or to none (D109).
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  });

  /// `POST /v1/auth/register`. Always a session with no workspace (D109).
  Future<Result<Session, AppError>> register({
    required String name,
    required String email,
    required String password,
  });

  /// The stored session, from the access token's claims, without a network
  /// call. Null when signed out.
  Future<Session?> currentSession();

  /// `POST /v1/auth/switch-workspace`: a new token pair scoped to
  /// [workspaceId], from a session with or without a workspace (WS-2).
  Future<Result<Session, AppError>> switchWorkspace(String workspaceId);

  /// Revokes the refresh token on the API (best effort) and forgets both.
  Future<void> logout();
}
