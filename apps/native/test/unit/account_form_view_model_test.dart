import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_view_model.dart';
import 'package:oewang/data/repositories_fake/sub_currencies_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';

void main() {
  group('AccountFormViewModel', () {
    late AccountFormViewModel vm;

    setUp(() async {
      vm = AccountFormViewModel(
        wallets: WalletsRepositoryFake(),
        groups: WalletGroupsRepositoryFake(),
        subCurrencies: SubCurrenciesRepositoryFake(),
      );
      await Future<void>.delayed(const Duration(milliseconds: 30));
    });

    tearDown(() => vm.dispose());

    test('canSave gates on name + group', () {
      expect(vm.canSave, isFalse);
      vm.setName('Spare Cash');
      expect(vm.canSave, isFalse);
      vm.setGroup('g-cash');
      expect(vm.canSave, isTrue);
    });

    test('successful save returns the new wallet', () async {
      vm
        ..setName('Spare Cash')
        ..setGroup('g-cash')
        ..setBalance(50000);
      final res = await vm.submit();
      expect(res, isNotNull);
      expect(vm.save.result?.name, 'Spare Cash');
      expect(vm.save.error, isNull);
    });
  });
}
