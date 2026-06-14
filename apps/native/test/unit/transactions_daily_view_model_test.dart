import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/ui/transactions/view_models/transactions_daily_view_model.dart';

void main() {
  group('TransactionsDailyViewModel', () {
    test('groups + sums fixtures from the fake repo for Jan 2026', () async {
      final repo = TransactionsRepositoryFake();
      final vm = TransactionsDailyViewModel(repo);
      await vm.load(DateTime(2026));

      expect(vm.loading, isFalse);
      expect(vm.error, isNull);
      // Five distinct days (1, 2, 3, 4, 5).
      expect(vm.groups.length, 5);
      // Newest day first.
      expect(vm.groups.first.date, DateTime(2026, 1, 5));
      expect(vm.expense.amount, 1952500);
      expect(vm.income.amount, 0);
      expect(vm.net.amount, -1952500);
      vm.dispose();
    });

    test('switching month triggers a reload', () async {
      final repo = TransactionsRepositoryFake();
      final vm = TransactionsDailyViewModel(repo);
      await vm.load(DateTime(2026));
      expect(vm.groups, isNotEmpty);

      await vm.setMonth(DateTime(2025, 12));
      expect(vm.month, DateTime(2025, 12));
      expect(vm.groups, isEmpty);
      vm.dispose();
    });
  });
}
