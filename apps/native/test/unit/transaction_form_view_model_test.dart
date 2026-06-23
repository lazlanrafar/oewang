import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_view_model.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  group('TransactionFormViewModel', () {
    late TransactionsRepositoryFake txRepo;
    late TransactionFormViewModel vm;

    setUp(() async {
      txRepo = TransactionsRepositoryFake();
      vm = TransactionFormViewModel(
        transactions: txRepo,
        wallets: WalletsRepositoryFake(),
        categories: CategoriesRepositoryFake(),
      );
      // Let the pickers settle.
      await Future<void>.delayed(const Duration(milliseconds: 30));
    });

    tearDown(() => vm.dispose());

    test('pickers load wallets + categories from the repos', () {
      expect(vm.walletOptions, isNotEmpty);
      expect(vm.categoryOptions, isNotEmpty);
      // Default type is expense — should only see expense categories.
      expect(
        vm.categoryOptions.every((c) => c.name == 'Food' || c.name == 'Rent'),
        isTrue,
      );
    });

    test('switching type filters categories + clears the selection', () {
      vm.setCategory('cat-food');
      expect(vm.state.categoryId, 'cat-food');
      vm.setType(TransactionType.income);
      expect(vm.state.categoryId, isNull);
      expect(vm.categoryOptions.every((c) => c.name != 'Food'), isTrue);
    });

    test('canSave gates on amount + wallet + category', () {
      expect(vm.canSave, isFalse);
      vm
        ..setWallet('w-cash')
        ..setCategory('cat-food');
      expect(vm.canSave, isFalse); // amount still 0
      vm.setAmount(15000);
      expect(vm.canSave, isTrue);
    });

    test('transfer requires from + to that differ; swap swaps them', () {
      vm
        ..setType(TransactionType.transfer)
        ..setAmount(50000);
      expect(vm.canSave, isFalse);
      vm
        ..setWallet('w-cash')
        ..setToWallet('w-cash');
      expect(vm.canSave, isFalse); // same wallet
      vm.setToWallet('w-bca');
      expect(vm.canSave, isTrue);
      vm.swapWallets();
      expect(vm.state.walletId, 'w-bca');
      expect(vm.state.toWalletId, 'w-cash');
    });

    test('switching to transfer clears the prior categoryId', () {
      vm
        ..setCategory('cat-food')
        ..setType(TransactionType.transfer);
      expect(vm.state.categoryId, isNull);
    });

    test('successful save persists via the repo and resets Continue', () async {
      vm
        ..setWallet('w-cash')
        ..setCategory('cat-food')
        ..setAmount(5000)
        ..setNote('Nasi Jinggo');

      final res = await vm.submit();
      expect(res, isNotNull);
      expect(vm.save.result, isNotNull);
      expect(vm.save.error, isNull);

      vm.resetForContinue();
      expect(vm.state.amount, 0);
      expect(vm.state.note, '');
      // Wallet + category are sticky for the next entry.
      expect(vm.state.walletId, 'w-cash');
      expect(vm.state.categoryId, 'cat-food');
    });
  });
}
