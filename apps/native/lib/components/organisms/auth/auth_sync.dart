import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/session.dart';

/// The `/sync` check every sign-in passes through (D109, MOB-3).
///
/// A session in a workspace goes on as it is. One without is moved into the
/// first workspace the user belongs to. Someone with none keeps a session
/// without a workspace, which the router sends to the workspace create screen.
Future<Result<Session, AppError>> syncWorkspace(
  Session session, {
  required AuthRepository auth,
  required WorkspacesRepository workspaces,
}) async {
  if (session.hasWorkspace) return Success(session);

  final listed = await workspaces.list();
  return switch (listed) {
    Failure(:final error) => Failure(error),
    Success(value: []) => Success(session),
    Success(:final value) => auth.switchWorkspace(value.first.id),
  };
}
