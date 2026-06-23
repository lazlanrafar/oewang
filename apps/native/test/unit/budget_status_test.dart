import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/dto/budget_status_dto.dart';
import 'package:oewang/data/repositories_fake/budgets_repository_fake.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

void main() {
  group('BudgetStatusDto.fromJson', () {
    test('parses camelCase wire keys with numeric amount', () {
      final dto = BudgetStatusDto.fromJson({
        'id': 'b-1',
        'categoryId': 'cat-food',
        'categoryName': 'Food',
        'amount': 1500000,
        'spent': 124500,
        'percentage': 8,
      });
      final status = dto.toDomain();
      expect(status.categoryName, 'Food');
      expect(status.amount.amount, 1500000);
      expect(status.spent.amount, 124500);
      expect(status.percentage, 8);
    });

    test('falls back to snake_case + string amounts', () {
      final dto = BudgetStatusDto.fromJson({
        'id': 'b-2',
        'category_id': 'cat-rent',
        'category_name': 'Rent',
        'amount': '2000000',
        'spent': '1800000',
        'percentage': '90',
      });
      final status = dto.toDomain();
      expect(status.categoryId, 'cat-rent');
      expect(status.amount.amount, 2000000);
      expect(status.percentage, 90);
    });
  });

  group('BudgetTotals', () {
    test('aggregates statuses and computes percent', () {
      const statuses = <BudgetStatus>[
        BudgetStatus(
          id: 'a',
          categoryId: 'cat-1',
          categoryName: 'a',
          amount: Money(amount: 1000),
          spent: Money(amount: 400),
          percentage: 40,
        ),
        BudgetStatus(
          id: 'b',
          categoryId: 'cat-2',
          categoryName: 'b',
          amount: Money(amount: 3000),
          spent: Money(amount: 600),
          percentage: 20,
        ),
      ];
      final totals = BudgetTotals.fromStatuses(statuses);
      expect(totals.totalBudget.amount, 4000);
      expect(totals.totalSpent.amount, 1000);
      expect(totals.percent, 25);
    });

    test('zero budget yields 0%, never NaN/Inf', () {
      const status = BudgetStatus(
        id: 'a',
        categoryId: 'cat-1',
        categoryName: 'a',
        amount: Money(amount: 0),
        spent: Money(amount: 50),
        percentage: 0,
      );
      final totals = BudgetTotals.fromStatuses(const [status]);
      expect(totals.percent, 0);
    });
  });

  group('BudgetsRepositoryFake', () {
    test('returns seeded statuses', () async {
      final repo = BudgetsRepositoryFake();
      final res = await repo.status();
      final list = res.fold((ok) => ok, (_) => const <BudgetStatus>[]);
      expect(list.length, 2);
      expect(list.first.categoryName, 'Food');
    });
  });
}
