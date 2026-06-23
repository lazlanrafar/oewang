import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_view_model.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';

void main() {
  group('AccountsViewModel', () {
    test('aggregates assets / liabilities / total from fake wallets', () async {
      final vm = AccountsViewModel(
        wallets: WalletsRepositoryFake(),
        groups: WalletGroupsRepositoryFake(),
      );
      await Future<void>.delayed(const Duration(milliseconds: 30));

      // Default fixtures: Cash 625k + Shopee 35.999 = 660.999 positive assets.
      // Liabilities: 131.500 (Gopay) + 1.947.500 (BCA) = 2.079.000.
      expect(vm.assets.amount, 660999);
      expect(vm.liabilities.amount, 2079000);
      expect(vm.total.amount, 660999 - 2079000);
      expect(vm.sections.length, 3); // Cash, Accounts, Debit Card
      expect(vm.sections.first.group.name, 'Cash');
      expect(vm.sections[1].group.name, 'Accounts');
      vm.dispose();
    });

    test('places ungrouped wallets into an "Others" tail section', () async {
      final wallets = WalletsRepositoryFake(seed: const []);
      // No groups in the fake either.
      final groups = WalletGroupsRepositoryFake(seed: const []);
      final vm = AccountsViewModel(wallets: wallets, groups: groups);
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(vm.sections, isEmpty);
      vm.dispose();
    });
  });
}
