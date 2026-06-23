import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/auth/auth_login_view_model.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';

void main() {
  group('LoginViewModel', () {
    late AuthRepositoryFake repo;
    late LoginViewModel vm;

    setUp(() {
      repo = AuthRepositoryFake();
      vm = LoginViewModel(repo);
    });

    tearDown(() => vm.dispose());

    test('canSubmit is false until email + password are valid', () {
      expect(vm.canSubmit, isFalse);
      vm
        ..setEmail('not-an-email')
        ..setPassword('short');
      expect(vm.canSubmit, isFalse);
      vm
        ..setEmail('test@oewang.com')
        ..setPassword('password');
      expect(vm.canSubmit, isTrue);
    });

    test('successful login produces a session', () async {
      vm
        ..setEmail('test@oewang.com')
        ..setPassword('password');
      final res = await vm.run();
      expect(res, isNotNull);
      expect(vm.submit.result, isNotNull);
      expect(vm.submit.error, isNull);
      expect(vm.submit.result!.token, 'fake-jwt-token');
    });

    test('bad credentials surface as an error message', () async {
      vm
        ..setEmail('test@oewang.com')
        ..setPassword('wrong-password');
      await vm.run();
      expect(vm.submit.result, isNull);
      expect(vm.errorMessage, 'Invalid email or password');
    });
  });
}
