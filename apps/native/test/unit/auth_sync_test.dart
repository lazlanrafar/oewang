import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/auth/auth_sync.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

class _Offline extends WorkspacesRepositoryFake {
  @override
  Future<Result<List<WorkspaceMembership>, AppError>> list() async =>
      const Failure(NetworkError());
}

void main() {
  group('MOB-3 the /sync check (D109)', () {
    late AuthRepositoryFake auth;

    setUp(() async {
      auth = AuthRepositoryFake(loginWorkspaceId: null);
      // A signed-in session with no workspace, as login can answer.
      await auth.login(email: auth.validEmail, password: auth.validPassword);
    });

    test('a session in a workspace goes on untouched', () async {
      const inWorkspace = Session(
        userId: 'u',
        workspaceId: 'ws',
        role: 'member',
      );
      final res = await syncWorkspace(
        inWorkspace,
        auth: auth,
        workspaces: _Offline(), // never asked
      );
      expect((res as Success).value, inWorkspace);
      expect(auth.switchedTo, isEmpty);
    });

    test('without one, it switches into the first workspace listed', () async {
      final res = await syncWorkspace(
        const Session(userId: 'fake-user-id'),
        auth: auth,
        workspaces: WorkspacesRepositoryFake(
          memberships: const [
            WorkspaceMembership(id: 'ws-a', name: 'A', role: 'owner'),
            WorkspaceMembership(id: 'ws-b', name: 'B', role: 'member'),
          ],
        ),
      );
      final session = (res as Success<Session, AppError>).value;
      expect(auth.switchedTo, ['ws-a']);
      expect(session.workspaceId, 'ws-a');
      expect(session.hasWorkspace, isTrue);
    });

    test('with none, the session stays workspace-less for create', () async {
      const bare = Session(userId: 'fake-user-id');
      final res = await syncWorkspace(
        bare,
        auth: auth,
        workspaces: WorkspacesRepositoryFake(),
      );
      expect((res as Success).value, bare);
      expect(auth.switchedTo, isEmpty);
    });

    test('a failed list is reported, not guessed past', () async {
      final res = await syncWorkspace(
        const Session(userId: 'fake-user-id'),
        auth: auth,
        workspaces: _Offline(),
      );
      expect((res as Failure).error, isA<NetworkError>());
      expect(auth.switchedTo, isEmpty);
    });
  });

  group('MOB-5 roles', () {
    test('owner and admin write; a member reads only', () {
      expect(const Session(userId: 'u', role: 'owner').canWrite, isTrue);
      expect(const Session(userId: 'u', role: 'admin').canWrite, isTrue);
      expect(const Session(userId: 'u', role: 'member').canWrite, isFalse);
      expect(const Session(userId: 'u').canWrite, isFalse);
    });
  });
}
