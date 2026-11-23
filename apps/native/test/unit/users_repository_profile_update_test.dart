import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/users_repository_fake.dart';

void main() {
  group('UsersRepositoryFake — profile updates', () {
    test('updateProfile updates only the supplied field', () async {
      final repo = UsersRepositoryFake();
      final res = await repo.updateProfile(name: 'New Name');
      final profile = res.fold((ok) => ok, (_) => null);
      expect(profile!.name, 'New Name');
      // Email and workspaces untouched.
      expect(profile.email, 'tester@oewang.com');
      expect(profile.workspaces.length, 2);
    });

    test('updateProfile with null name preserves the existing one', () async {
      final repo = UsersRepositoryFake();
      await repo.updateProfile(name: 'Alice');
      final res = await repo.updateProfile(mobile: '+62 000');
      final profile = res.fold((ok) => ok, (_) => null);
      expect(profile!.name, 'Alice');
    });

    test('uploadAvatar swaps the profile_picture', () async {
      final repo = UsersRepositoryFake();
      final res = await repo.uploadAvatar(File('/tmp/test.png'));
      final url = res.fold((ok) => ok, (_) => '');
      expect(url, startsWith('fake://avatars/'));

      final fresh = await repo.getProfile();
      final profile = fresh.fold((ok) => ok, (_) => null);
      expect(profile!.profilePicture, url);
    });
  });
}
