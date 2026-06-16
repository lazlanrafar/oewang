import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

/// Combined profile returned by `GET /v1/users/me`.
@immutable
class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    required this.email,
    required this.workspaces,
    this.name,
    this.profilePicture,
    this.activeWorkspaceId,
  });

  final String id;
  final String email;
  final String? name;
  final String? profilePicture;
  final String? activeWorkspaceId;
  final List<WorkspaceMembership> workspaces;

  /// Human-readable label: name if set, otherwise the local part of the email.
  String get displayName {
    if (name != null && name!.trim().isNotEmpty) return name!.trim();
    final at = email.indexOf('@');
    return at > 0 ? email.substring(0, at) : email;
  }

  WorkspaceMembership? get activeWorkspace {
    if (activeWorkspaceId == null) return null;
    for (final w in workspaces) {
      if (w.id == activeWorkspaceId) return w;
    }
    return null;
  }

  @override
  List<Object?> get props => [
    id,
    email,
    name,
    profilePicture,
    activeWorkspaceId,
    workspaces,
  ];
}
