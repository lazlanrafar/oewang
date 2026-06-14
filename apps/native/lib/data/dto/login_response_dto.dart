import 'package:oewang/domain/models/session.dart';

/// Wire model for `POST /v1/auth/login` (`{ token, user_id, workspace_id }`).
class LoginResponseDto {
  const LoginResponseDto({
    required this.token,
    required this.userId,
    this.workspaceId,
  });

  factory LoginResponseDto.fromJson(Map<String, dynamic> json) {
    return LoginResponseDto(
      token: json['token'] as String,
      userId: json['user_id'] as String,
      workspaceId: json['workspace_id'] as String?,
    );
  }

  final String token;
  final String userId;
  final String? workspaceId;

  Session toDomain() =>
      Session(token: token, userId: userId, workspaceId: workspaceId);
}
