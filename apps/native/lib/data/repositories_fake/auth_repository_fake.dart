import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/domain/models/session.dart';

/// Deterministic auth repo for tests + previews. Hardcodes a single user.
class AuthRepositoryFake implements AuthRepository {
  AuthRepositoryFake({
    this.validEmail = 'test@oewang.com',
    this.validPassword = 'password',
    this.loginWorkspaceId = 'fake-workspace-id',
    this.role = 'owner',
  });

  final String validEmail;
  final String validPassword;

  /// The workspace a login lands in; null is a user with none (D109).
  final String? loginWorkspaceId;
  final String role;

  Session? _session;

  /// Every `switchWorkspace` call, in order.
  final List<String> switchedTo = [];

  @override
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    if (email != validEmail || password != validPassword) {
      return const Failure(
        UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS'),
      );
    }
    _session = Session(
      userId: 'fake-user-id',
      workspaceId: loginWorkspaceId,
      role: loginWorkspaceId == null ? null : role,
    );
    return Success(_session!);
  }

  @override
  Future<Result<Session, AppError>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    // Signing up makes an account and nothing else (D109).
    _session = const Session(userId: 'fake-user-id');
    return Success(_session!);
  }

  @override
  Future<Session?> currentSession() async => _session;

  @override
  Future<Result<Session, AppError>> switchWorkspace(String workspaceId) async {
    if (_session == null) return const Failure(UnauthorizedError());
    switchedTo.add(workspaceId);
    _session = Session(
      userId: _session!.userId,
      workspaceId: workspaceId,
      role: role,
    );
    return Success(_session!);
  }

  @override
  Future<void> logout() async {
    _session = null;
  }
}
