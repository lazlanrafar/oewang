import 'package:oewang/domain/models/session.dart';

/// Wire model for the session the auth routes answer with (login, register,
/// refresh, switch-workspace): `SessionResponse` in the API.
class LoginResponseDto {
  const LoginResponseDto({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    this.workspaceId,
    this.role,
  });

  factory LoginResponseDto.fromJson(Map<String, dynamic> json) {
    return LoginResponseDto(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      userId: json['user_id'] as String,
      workspaceId: json['workspace_id'] as String?,
      role: json['role'] as String?,
    );
  }

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String? workspaceId;
  final String? role;

  Session toDomain() =>
      Session(userId: userId, workspaceId: workspaceId, role: role);
}
