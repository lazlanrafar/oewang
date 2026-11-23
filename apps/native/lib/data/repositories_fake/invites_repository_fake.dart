import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/invites_repository.dart';

/// Accepts only [validToken], into [workspaceId]; any other token is the
/// API's answer to an expired, used or someone else's invitation.
class InvitesRepositoryFake implements InvitesRepository {
  InvitesRepositoryFake({
    this.validToken = 'invite-token',
    this.workspaceId = 'ws-invited',
  });

  final String validToken;
  final String workspaceId;
  final List<String> accepted = [];

  @override
  Future<Result<String, AppError>> accept(String token) async {
    accepted.add(token);
    if (token != validToken) {
      return const Failure(
        ServerError(
          statusCode: 422,
          code: 'INVITE_INVALID',
          message: 'That invitation is no longer valid.',
        ),
      );
    }
    return Success(workspaceId);
  }
}
