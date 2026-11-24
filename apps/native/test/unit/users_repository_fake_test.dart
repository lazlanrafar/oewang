import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/users_repository_fake.dart';

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
  });
}
