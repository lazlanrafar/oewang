import 'package:oewang/domain/models/workspace.dart';

/// Wire model for `POST /v1/workspaces` responses.
class WorkspaceDto {
  const WorkspaceDto({
    required this.id,
    required this.name,
    this.planStatus = 'free',
  });

  factory WorkspaceDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceDto(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      planStatus:
          (json['planStatus'] ?? json['plan_status']) as String? ?? 'free',
    );
  }

  final String id;
  final String name;
  final String planStatus;

  Workspace toDomain() => Workspace(id: id, name: name, planStatus: planStatus);
}
