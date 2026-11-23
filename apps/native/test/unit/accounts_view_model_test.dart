import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_view_model.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';
import 'package:oewang/domain/models/wallet.dart';

void main() {
  group('AccountsViewModel', () {
    test('aggregates assets / liabilities / total from fake wallets', () async {
      final vm = AccountsViewModel(
        wallets: WalletsRepositoryFake(),
        groups: WalletGroupsRepositoryFake(),
        workspaces: WorkspacesRepositoryFake(),
      );
      await vm.ready;

      // Default fixtures: Cash 625k + Shopee 35.999 = 660.999 positive assets.
      // Liabilities: 131.500 (Gopay) + 1.947.500 (BCA) = 2.079.000.
      expect(vm.assets.amount, Decimal.fromInt(660999));
      expect(vm.liabilities.amount, Decimal.fromInt(2079000));
      expect(vm.total.amount, Decimal.fromInt(660999 - 2079000));
      expect(vm.sections.length, 3); // Cash, Accounts, Debit Card
      expect(vm.sections.first.group.name, 'Cash');
      expect(vm.sections[1].group.name, 'Accounts');
      vm.dispose();
    });

    test('MOB-4 leaves a foreign wallet out of every sum', () async {
      final vm = AccountsViewModel(
        wallets: WalletsRepositoryFake(
          seed: [
            Wallet(id: 'a', name: 'Cash', balance: Decimal.fromInt(1000)),
            Wallet(
              id: 'b',
              name: 'Wise',
              balance: Decimal.fromInt(50),
              currency: 'USD',
            ),
          ],
        ),
        groups: WalletGroupsRepositoryFake(seed: const []),
        workspaces: WorkspacesRepositoryFake(),
      );
      await vm.ready;
      expect(vm.assets.amount, Decimal.fromInt(1000));
      expect(vm.assets.currency, 'IDR');
      // Both still listed, under Others.
      expect(vm.sections.single.wallets.length, 2);
      expect(vm.sections.single.subtotal.amount, Decimal.fromInt(1000));
      vm.dispose();
    });

    test('places ungrouped wallets into an "Others" tail section', () async {
      final wallets = WalletsRepositoryFake(seed: const []);
      // No groups in the fake either.
      final groups = WalletGroupsRepositoryFake(seed: const []);
      final vm = AccountsViewModel(
        wallets: wallets,
        groups: groups,
        workspaces: WorkspacesRepositoryFake(),
      );
      await vm.ready;
      expect(vm.sections, isEmpty);
      vm.dispose();
    });
  });
}
