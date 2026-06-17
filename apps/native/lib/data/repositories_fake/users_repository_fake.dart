import 'dart:io';

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

  UserProfile get profile => _profile;

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
    _profile = UserProfile(
      id: _profile.id,
      email: _profile.email,
      name: name ?? _profile.name,
      profilePicture: _profile.profilePicture,
      activeWorkspaceId: _profile.activeWorkspaceId,
      workspaces: _profile.workspaces,
    );
    return Success(_profile);
  }

  @override
  Future<Result<String, AppError>> uploadAvatar(File file) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final url = 'fake://avatars/${file.path.hashCode}';
    _profile = UserProfile(
      id: _profile.id,
      email: _profile.email,
      name: _profile.name,
      profilePicture: url,
      activeWorkspaceId: _profile.activeWorkspaceId,
      workspaces: _profile.workspaces,
    );
    return Success(url);
  }

  @override
  Future<Result<void, AppError>> switchWorkspace(String workspaceId) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final exists = _profile.workspaces.any((w) => w.id == workspaceId);
    if (!exists) {
      return const Failure(
        ServerError(
          statusCode: 400,
          message: 'User is not a member of this workspace',
        ),
      );
    }
    _profile = UserProfile(
      id: _profile.id,
      email: _profile.email,
      name: _profile.name,
      profilePicture: _profile.profilePicture,
      activeWorkspaceId: workspaceId,
      workspaces: _profile.workspaces,
    );
    return const Success<void, AppError>(null);
  }
}
