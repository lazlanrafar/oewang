import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/domain/models/session.dart';

/// Deterministic auth repo for tests + previews. Hardcodes a single user.
class AuthRepositoryFake implements AuthRepository {
  AuthRepositoryFake({
    this.validEmail = 'test@oewang.com',
    this.validPassword = 'password',
  });

  final String validEmail;
  final String validPassword;

  Session? _session;

  @override
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    if (email != validEmail || password != validPassword) {
      return const Failure(
        UnauthorizedError('Invalid email or password'),
      );
    }
    _session = const Session(
      token: 'fake-jwt-token',
      userId: 'fake-user-id',
      workspaceId: 'fake-workspace-id',
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
    // New users have no workspace yet — onboarding creates one.
    _session = const Session(
      token: 'fake-jwt-token',
      userId: 'fake-user-id',
    );
    return Success(_session!);
  }

  @override
  Future<Session?> currentSession() async => _session;

  @override
  Future<Result<Session, AppError>> refreshToken() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    if (_session == null) {
      return const Failure(UnauthorizedError());
    }
    _session = Session(
      token: '${_session!.token}-refreshed',
      userId: _session!.userId,
      workspaceId: _session!.workspaceId,
    );
    return Success(_session!);
  }

  @override
  Future<void> logout() async {
    _session = null;
  }
}
