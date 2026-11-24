import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/invites_repository.dart';
import 'package:oewang/data/repositories/users_repository.dart';

enum InviteAcceptStatus { running, joined, missing, invalid, failed }

/// Accepting an invitation (WS-3, MOB-9), as the web's `/accept-invite`
/// does: accept, then move the session into the workspace. Only the invited
/// address may accept; anyone else is told which address they are signed in
/// with.
class InviteAcceptViewModel extends ChangeNotifier {
  InviteAcceptViewModel({
    required InvitesRepository invites,
    required UsersRepository users,
    required Future<AppError?> Function(String workspaceId) switchTo,
  }) : _invites = invites,
       _users = users,
       _switchTo = switchTo;

  final InvitesRepository _invites;
  final UsersRepository _users;
  final Future<AppError?> Function(String workspaceId) _switchTo;

  InviteAcceptStatus status = InviteAcceptStatus.running;

  /// The signed-in address, for the invalid message.
  String email = '';

  /// What went wrong when the API could not be reached.
  String? failure;

  Future<void> accept(String? token) async {
    _set(InviteAcceptStatus.running);
    if (token == null || token.isEmpty) {
      return _set(InviteAcceptStatus.missing);
    }
    final accepted = await _invites.accept(token);
    final error = switch (accepted) {
      // Switching re-registers this device for push in the new workspace.
      Success(:final value) => await _switchTo(value),
      Failure(:final error) => error,
    };
    if (error == null) return _set(InviteAcceptStatus.joined);
    if (error is NetworkError) {
      failure = error.message;
      return _set(InviteAcceptStatus.failed);
    }
    final me = await _users.getProfile();
    email = me.fold((profile) => profile.email, (_) => '');
    _set(InviteAcceptStatus.invalid);
  }

  void _set(InviteAcceptStatus next) {
    status = next;
    notifyListeners();
  }
}
