import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

/// Wire model for `WorkspaceListItem`: `GET /v1/workspaces` rows and the
/// `POST /v1/workspaces` answer.
class WorkspaceDto {
  const WorkspaceDto({
    required this.id,
    required this.name,
    required this.slug,
    required this.currencyCode,
    required this.role,
    this.currencyLocked = false,
  });

  factory WorkspaceDto.fromJson(Map<String, dynamic> json) => WorkspaceDto(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    slug: json['slug'] as String?,
    currencyCode: json['currency_code'] as String? ?? '',
    role: json['role'] as String? ?? 'member',
    currencyLocked: json['currency_locked'] as bool? ?? false,
  );

  final String id;
  final String name;
  final String? slug;
  final String currencyCode;
  final String role;

  /// Only on `GET /v1/workspaces/current` (WAL-6).
  final bool currencyLocked;

  Workspace toDomain() => Workspace(
    id: id,
    name: name,
    currencyCode: currencyCode,
    currencyLocked: currencyLocked,
  );

  WorkspaceMembership toMembership() =>
      WorkspaceMembership(id: id, name: name, role: role, slug: slug);
}
