import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_view_model.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';

void main() {
  group('OnboardingViewModel', () {
    Future<OnboardingViewModel> make() async {
      final auth = AuthRepositoryFake();
      // Simulate having just registered so refreshToken() has a session.
      await auth.register(
        name: 'Jane',
        email: 'jane@example.com',
        password: 'secret1',
      );
      return OnboardingViewModel(
        auth: auth,
        workspaces: WorkspacesRepositoryFake(),
      );
    }

    test('canSubmit gates on a non-empty workspace name', () async {
      final vm = await make();
      expect(vm.canSubmit, isFalse);
      vm.setName('My Company');
      expect(vm.canSubmit, isTrue);
      vm.dispose();
    });

    test('submit creates the workspace and returns a session', () async {
      final vm = await make();
      vm.setName('My Company');
      final session = await vm.submit();
      expect(session, isNotNull);
      expect(vm.errorMessage, isNull);
      vm.dispose();
    });
  });
}
