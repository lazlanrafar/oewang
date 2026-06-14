import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// Authenticated session — the JWT + the IDs encoded in it.
@immutable
class Session extends Equatable {
  const Session({
    required this.token,
    required this.userId,
    this.workspaceId,
  });

  final String token;
  final String userId;
  final String? workspaceId;

  Session copyWith({String? token, String? userId, String? workspaceId}) {
    return Session(
      token: token ?? this.token,
      userId: userId ?? this.userId,
      workspaceId: workspaceId ?? this.workspaceId,
    );
  }

  @override
  List<Object?> get props => [token, userId, workspaceId];
}
