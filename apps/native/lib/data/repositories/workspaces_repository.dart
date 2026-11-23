import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/workspace.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

abstract class WorkspacesRepository {
  /// `GET /v1/workspaces`: every workspace the user belongs to, with the
  /// role in each. Works from a session with no workspace (D109).
  Future<Result<List<WorkspaceMembership>, AppError>> list();

  /// `POST /v1/workspaces` (WS-6). The caller then switches into it.
  Future<Result<Workspace, AppError>> create({
    required String name,
    required String currencyCode,
  });
}
