import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// Who is signed in, and where. Read from the API's session answer or the
/// access token's claims. The tokens themselves stay in secure storage and
/// never live in app state (MOB-2).
@immutable
class Session extends Equatable {
  const Session({required this.userId, this.workspaceId, this.role});

  final String userId;

  /// Null for a session with no workspace (D109): the app goes to `/sync`.
  final String? workspaceId;

  /// `owner`, `admin` or `member`. A member reads and never writes.
  final String? role;

  bool get hasWorkspace => workspaceId != null && workspaceId!.isNotEmpty;

  /// Whether to show controls that write (MOB-5). The API refuses the write
  /// either way; this only keeps a viewer from seeing a button that fails.
  bool get canWrite => role == 'owner' || role == 'admin';

  @override
  List<Object?> get props => [userId, workspaceId, role];
}
