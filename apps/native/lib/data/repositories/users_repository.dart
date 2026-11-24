import 'dart:io';
import 'dart:typed_data';

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

  /// `PUT /v1/auth/me/avatar`: a JPEG, PNG or WebP up to 700 KB, stored as a
  /// 256px square. Returns the new photo version id (`profile_picture`).
  Future<Result<String, AppError>> uploadAvatar(File file);

  /// `GET /v1/auth/me/avatar`: the photo's bytes, or null when there is none
  /// (AUTH-13).
  Future<Result<Uint8List?, AppError>> avatar();

  /// `PUT /v1/auth/me/colors`: both colours every time, `#rrggbb` or null for
  /// the default (UI-9, D100).
  Future<Result<void, AppError>> updateColors({
    required String? incomeColor,
    required String? expenseColor,
  });

  /// Permanently erases the user's personal data (anonymizes the user row,
  /// soft-deletes memberships/notifications, server-side audit logged). The
  /// caller must clear the local session afterward — this does not log out.
  Future<Result<void, AppError>> deleteAccount();
}
