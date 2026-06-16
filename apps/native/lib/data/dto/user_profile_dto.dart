import 'package:oewang/domain/models/user_profile.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class WorkspaceMembershipDto {
  const WorkspaceMembershipDto({
    required this.id,
    required this.name,
    required this.role,
    this.slug,
    this.planName,
  });

  factory WorkspaceMembershipDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceMembershipDto(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Untitled workspace',
      role: json['role'] as String? ?? 'member',
      slug: json['slug'] as String?,
      planName: (json['plan_name'] ?? json['planName']) as String?,
    );
  }

  final String id;
  final String name;
  final String role;
  final String? slug;
  final String? planName;

  WorkspaceMembership toDomain() => WorkspaceMembership(
    id: id,
    name: name,
    role: role,
    slug: slug,
    planName: planName,
  );
}

class UserProfileDto {
  const UserProfileDto({
    required this.id,
    required this.email,
    required this.workspaces,
    this.name,
    this.profilePicture,
    this.activeWorkspaceId,
  });

  factory UserProfileDto.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? json;
    final wsRaw = json['workspaces'];
    final workspaces = <WorkspaceMembershipDto>[];
    if (wsRaw is List) {
      for (final w in wsRaw) {
        if (w is Map<String, dynamic>) {
          workspaces.add(WorkspaceMembershipDto.fromJson(w));
        }
      }
    }
    return UserProfileDto(
      id: user['id'] as String,
      email: user['email'] as String? ?? '',
      name: user['name'] as String?,
      profilePicture:
          (user['profile_picture'] ?? user['profilePicture']) as String?,
      activeWorkspaceId:
          (user['workspace_id'] ?? user['workspaceId']) as String?,
      workspaces: workspaces,
    );
  }

  final String id;
  final String email;
  final String? name;
  final String? profilePicture;
  final String? activeWorkspaceId;
  final List<WorkspaceMembershipDto> workspaces;

  UserProfile toDomain() => UserProfile(
    id: id,
    email: email,
    name: name,
    profilePicture: profilePicture,
    activeWorkspaceId: activeWorkspaceId,
    workspaces: workspaces.map((w) => w.toDomain()).toList(),
  );
}
