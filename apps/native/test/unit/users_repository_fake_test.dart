import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/users_repository_fake.dart';
import 'package:oewang/domain/models/user_profile.dart';

void main() {
  group('UsersRepositoryFake', () {
    test('getProfile returns the seeded profile', () async {
      final repo = UsersRepositoryFake();
      final res = await repo.getProfile();
      final profile = res.fold((ok) => ok, (_) => null);
      expect(profile, isNotNull);
      expect(profile!.workspaces.length, 2);
      expect(profile.activeWorkspaceId, 'ws-personal');
    });

    test('switchWorkspace updates the active id', () async {
      final repo = UsersRepositoryFake();
      final switchRes = await repo.switchWorkspace('ws-startup');
      expect(switchRes.isOk, isTrue);
      final next = await repo.getProfile();
      final updated = next.fold<UserProfile?>((ok) => ok, (_) => null);
      expect(updated!.activeWorkspaceId, 'ws-startup');
    });

    test('switchWorkspace rejects unknown workspace ids', () async {
      final repo = UsersRepositoryFake();
      final res = await repo.switchWorkspace('ws-not-a-member');
      expect(res.isErr, isTrue);
    });
  });
}
