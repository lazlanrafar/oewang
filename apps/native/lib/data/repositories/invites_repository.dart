import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

abstract class InvitesRepository {
  /// `POST /v1/workspaces/accept-invite`: the workspace joined. Any session
  /// will do, with or without a workspace (D109). `INVITE_INVALID` unless
  /// the caller's email is the invited one.
  Future<Result<String, AppError>> accept(String token);
}
