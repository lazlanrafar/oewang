import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/auth/auth_register_view_model.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';

void main() {
  group('RegisterViewModel', () {
    RegisterViewModel make() => RegisterViewModel(AuthRepositoryFake());

    test('canSubmit gates on name, email, password length and match', () {
      final vm = make();
      expect(vm.canSubmit, isFalse);
      vm
        ..setName('Jane')
        ..setEmail('jane@example.com')
        ..setPassword('secret1');
      expect(vm.canSubmit, isFalse, reason: 'confirm not yet entered');
      vm.setConfirm('nope');
      expect(vm.canSubmit, isFalse);
      expect(vm.mismatchMessage, isNotNull);
      vm.setConfirm('secret1');
      expect(vm.canSubmit, isTrue);
      expect(vm.mismatchMessage, isNull);
      vm.dispose();
    });

    test('successful register returns a session with no workspace', () async {
      final vm = make()
        ..setName('Jane')
        ..setEmail('jane@example.com')
        ..setPassword('secret1')
        ..setConfirm('secret1');
      final res = await vm.run();
      expect(res, isNotNull);
      expect(vm.errorMessage, isNull);
      res!.fold(
        (session) => expect(session.workspaceId, isNull),
        (_) => fail('expected success'),
      );
      vm.dispose();
    });
  });
}
