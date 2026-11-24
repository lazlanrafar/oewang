import 'dart:io';
import 'dart:typed_data';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/users_repository.dart';
import 'package:oewang/domain/models/user_profile.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class UsersRepositoryFake implements UsersRepository {
  UsersRepositoryFake({UserProfile? seed}) : _profile = seed ?? _defaultSeed;

  static const UserProfile _defaultSeed = UserProfile(
    id: 'u-1',
    email: 'tester@oewang.com',
    name: 'Test User',
    activeWorkspaceId: 'ws-personal',
    workspaces: [
      WorkspaceMembership(
        id: 'ws-personal',
        name: 'Personal',
        role: 'owner',
        planName: 'Free',
      ),
      WorkspaceMembership(
        id: 'ws-startup',
        name: 'Startup Inc.',
        role: 'admin',
        planName: 'Pro',
      ),
    ],
  );

  UserProfile _profile;
  Uint8List? _avatar;

  UserProfile get profile => _profile;

  UserProfile _copy({
    String? name,
    String? profilePicture,
    String? incomeColor,
    String? expenseColor,
    bool colors = false,
  }) => UserProfile(
    id: _profile.id,
    email: _profile.email,
    name: name ?? _profile.name,
    profilePicture: profilePicture ?? _profile.profilePicture,
    incomeColor: colors ? incomeColor : _profile.incomeColor,
    expenseColor: colors ? expenseColor : _profile.expenseColor,
    activeWorkspaceId: _profile.activeWorkspaceId,
    workspaces: _profile.workspaces,
  );

  @override
  Future<Result<UserProfile, AppError>> getProfile() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(_profile);
  }

  @override
  Future<Result<UserProfile, AppError>> updateProfile({
    String? name,
    String? mobile,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    _profile = _copy(name: name);
    return Success(_profile);
  }

  @override
  Future<Result<String, AppError>> uploadAvatar(File file) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final version = 'fake-${file.path.hashCode}';
    _avatar = Uint8List(0);
    _profile = _copy(profilePicture: version);
    return Success(version);
  }

  @override
  Future<Result<Uint8List?, AppError>> avatar() async => Success(_avatar);

  @override
  Future<Result<void, AppError>> updateColors({
    required String? incomeColor,
    required String? expenseColor,
  }) async {
    _profile = _copy(
      incomeColor: incomeColor,
      expenseColor: expenseColor,
      colors: true,
    );
    return const Success<void, AppError>(null);
  }

  @override
  Future<Result<void, AppError>> deleteAccount() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    _profile = UserProfile(
      id: _profile.id,
      email: '',
      name: 'Deleted user',
      workspaces: const [],
    );
    return const Success<void, AppError>(null);
  }
}
