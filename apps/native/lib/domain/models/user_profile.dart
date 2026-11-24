import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

/// `GET /v1/auth/me` plus the `GET /v1/workspaces` rows.
@immutable
class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    required this.email,
    required this.workspaces,
    this.name,
    this.profilePicture,
    this.incomeColor,
    this.expenseColor,
    this.activeWorkspaceId,
  });

  final String id;
  final String email;
  final String? name;

  /// The photo's version id, or null for initials. Changes with each upload,
  /// so it keys the cached bytes.
  final String? profilePicture;

  /// `#rrggbb`, or null for the default (UI-9).
  final String? incomeColor;
  final String? expenseColor;
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
    incomeColor,
    expenseColor,
    activeWorkspaceId,
    workspaces,
  ];
}
