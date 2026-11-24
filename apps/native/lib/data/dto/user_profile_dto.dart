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
    this.incomeColor,
    this.expenseColor,
    this.activeWorkspaceId,
  });

  /// `GET /v1/auth/me` plus the `GET /v1/workspaces` rows.
  factory UserProfileDto.fromMe(
    Map<String, dynamic> me,
    List<WorkspaceMembershipDto> workspaces,
  ) {
    final user = me['user'] as Map<String, dynamic>;
    final workspace = me['workspace'] as Map<String, dynamic>?;
    return UserProfileDto(
      id: user['id'] as String,
      email: user['email'] as String? ?? '',
      name: user['name'] as String?,
      // A photo version id; the bytes come from `/v1/auth/me/avatar` (D94).
      profilePicture: user['profile_picture'] as String?,
      incomeColor: user['income_color'] as String?,
      expenseColor: user['expense_color'] as String?,
      activeWorkspaceId: workspace?['id'] as String?,
      workspaces: workspaces,
    );
  }

  final String id;
  final String email;
  final String? name;
  final String? profilePicture;
  final String? incomeColor;
  final String? expenseColor;
  final String? activeWorkspaceId;
  final List<WorkspaceMembershipDto> workspaces;

  UserProfile toDomain() => UserProfile(
    id: id,
    email: email,
    name: name,
    profilePicture: profilePicture,
    incomeColor: incomeColor,
    expenseColor: expenseColor,
    activeWorkspaceId: activeWorkspaceId,
    workspaces: workspaces.map((w) => w.toDomain()).toList(),
  );
}
