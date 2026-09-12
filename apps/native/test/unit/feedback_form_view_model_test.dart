import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/settings/feedback/feedback_form_view_model.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';
import 'package:oewang/data/repositories_fake/feedback_repository_fake.dart';

void main() {
  group('FeedbackFormViewModel', () {
    test('canSave gates on a non-empty message', () {
      final vm = FeedbackFormViewModel(feedback: FeedbackRepositoryFake());

      expect(vm.canSave, isFalse);
      vm.setMessage('  ');
      expect(vm.canSave, isFalse);
      vm.setMessage('Something is broken');
      expect(vm.canSave, isTrue);

      vm.dispose();
    });

    test('successful submit reports no error', () async {
      final vm = FeedbackFormViewModel(feedback: FeedbackRepositoryFake());
      vm.setType(FeedbackType.featureRequest);
      vm.setMessage('Add dark mode');

      await vm.submit();

      expect(vm.save.error, isNull);
      vm.dispose();
    });
  });
}
