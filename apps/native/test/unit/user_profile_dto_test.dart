import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/dto/user_profile_dto.dart';

void main() {
  group('UserProfileDto.fromMe', () {
    test('reads GET /v1/auth/me plus the GET /v1/workspaces rows', () {
      final dto = UserProfileDto.fromMe(
        {
          'user': {
            'id': 'u-1',
            'email': 'a@b.com',
            'name': 'Alice',
            'profile_picture': 'v-123',
          },
          'workspace': {'id': 'ws-1', 'name': 'Personal'},
          'role': 'owner',
        },
        [
          WorkspaceMembershipDto.fromJson({
            'id': 'ws-1',
            'name': 'Personal',
            'role': 'owner',
          }),
          WorkspaceMembershipDto.fromJson({
            'id': 'ws-2',
            'name': 'Startup',
            'role': 'member',
          }),
        ],
      );
      final profile = dto.toDomain();
      expect(profile.id, 'u-1');
      expect(profile.email, 'a@b.com');
      expect(profile.activeWorkspaceId, 'ws-1');
      // A photo version id, not a URL the header can load (M2).
      expect(profile.profilePicture, isNull);
      expect(profile.workspaces.length, 2);
      expect(profile.activeWorkspace?.name, 'Personal');
      expect(profile.displayName, 'Alice');
    });

    test('displayName falls back to email local-part when name is empty', () {
      final dto = UserProfileDto.fromMe({
        'user': {'id': 'u-2', 'email': 'someone@x.com'},
        'workspace': null,
        'role': null,
      }, const []);
      expect(dto.toDomain().displayName, 'someone');
      expect(dto.toDomain().activeWorkspaceId, isNull);
    });
  });
}
