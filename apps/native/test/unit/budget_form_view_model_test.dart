import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/budgets/budgets_form_view_model.dart';
import 'package:oewang/data/repositories_fake/budgets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

void main() {
  group('BudgetFormViewModel', () {
    BudgetFormViewModel make({BudgetStatus? editing}) => BudgetFormViewModel(
      budgets: BudgetsRepositoryFake(),
      categories: CategoriesRepositoryFake(),
      editing: editing,
    );

    test('canSave gates on category + positive amount', () async {
      final vm = make();
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(vm.canSave, isFalse);
      vm.setAmount(50000);
      expect(vm.canSave, isFalse);
      vm.setCategory('cat-food');
      expect(vm.canSave, isTrue);
      vm.dispose();
    });

    test('edit mode seeds amount + category and locks the category', () {
      final vm = make(
        editing: const BudgetStatus(
          id: 'b-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          amount: Money(amount: 1000000),
          spent: Money(amount: 0),
          percentage: 0,
        ),
      );
      expect(vm.isEditing, isTrue);
      expect(vm.editingCategoryName, 'Food');
      expect(vm.state.categoryId, 'cat-food');
      expect(vm.state.amount, 1000000);
      expect(vm.canSave, isTrue);
      vm.dispose();
    });

    test('successful create reports no error', () async {
      final vm = make();
      await Future<void>.delayed(const Duration(milliseconds: 30));
      vm
        ..setCategory('cat-food')
        ..setAmount(750000);
      final res = await vm.submit();
      expect(res, isNotNull);
      expect(vm.save.error, isNull);
      vm.dispose();
    });
  });
}
