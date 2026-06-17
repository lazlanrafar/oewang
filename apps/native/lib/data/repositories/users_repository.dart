import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/user_profile.dart';

abstract class UsersRepository {
  Future<Result<UserProfile, AppError>> getProfile();

  /// Updates the editable fields of the user profile. Returns the new profile.
  Future<Result<UserProfile, AppError>> updateProfile({
    String? name,
    String? mobile,
  });

  /// Uploads a new avatar via multipart and returns the signed URL the server
  /// stored on the user record.
  Future<Result<String, AppError>> uploadAvatar(File file);

  /// Persists the active workspace on the server. Caller must follow up with
  /// `AuthRepository.refreshToken()` to mint a JWT carrying the new
  /// workspace_id before any subsequent API call.
  Future<Result<void, AppError>> switchWorkspace(String workspaceId);
}
