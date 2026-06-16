import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/user_profile.dart';

abstract class UsersRepository {
  Future<Result<UserProfile, AppError>> getProfile();

  /// Persists the active workspace on the server. Caller must follow up with
  /// `AuthRepository.refreshToken()` to mint a JWT carrying the new
  /// workspace_id before any subsequent API call.
  Future<Result<void, AppError>> switchWorkspace(String workspaceId);
}
