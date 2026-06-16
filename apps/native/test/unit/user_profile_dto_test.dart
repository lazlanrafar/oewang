import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/dto/user_profile_dto.dart';

void main() {
  group('UserProfileDto.fromJson', () {
    test('parses /v1/users/me payload with nested user + workspaces', () {
      final dto = UserProfileDto.fromJson({
        'user': {
          'id': 'u-1',
          'email': 'a@b.com',
          'name': 'Alice',
          'workspace_id': 'ws-1',
          'profile_picture': 'https://example.com/a.png',
        },
        'workspaces': [
          {
            'id': 'ws-1',
            'name': 'Personal',
            'role': 'owner',
            'plan_name': 'Free',
          },
          {
            'id': 'ws-2',
            'name': 'Startup',
            'role': 'admin',
          },
        ],
      });
      final profile = dto.toDomain();
      expect(profile.id, 'u-1');
      expect(profile.email, 'a@b.com');
      expect(profile.activeWorkspaceId, 'ws-1');
      expect(profile.profilePicture, 'https://example.com/a.png');
      expect(profile.workspaces.length, 2);
      expect(profile.activeWorkspace?.name, 'Personal');
      expect(profile.displayName, 'Alice');
    });

    test('displayName falls back to email local-part when name is empty', () {
      final dto = UserProfileDto.fromJson({
        'user': {'id': 'u-2', 'email': 'someone@x.com'},
        'workspaces': const <Map<String, dynamic>>[],
      });
      expect(dto.toDomain().displayName, 'someone');
    });
  });
}
