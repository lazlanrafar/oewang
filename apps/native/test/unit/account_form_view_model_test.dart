import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_view_model.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/wallet.dart';

/// Counts creates and refuses the first adjust, like a dropped connection.
class _FlakyAdjustWallets extends WalletsRepositoryFake {
  int creates = 0;
  int adjusts = 0;

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) {
    creates++;
    return super.create(draft);
  }

  @override
  Future<Result<Wallet, AppError>> adjust(String id, Decimal balance) async {
    adjusts++;
    if (adjusts == 1) {
      return const Failure<Wallet, AppError>(NetworkError('offline'));
    }
    return super.adjust(id, balance);
  }
}

void main() {
  group('AccountFormViewModel', () {
    late AccountFormViewModel vm;

    setUp(() async {
      vm = AccountFormViewModel(
        wallets: WalletsRepositoryFake(),
        groups: WalletGroupsRepositoryFake(),
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
        ..setBalance(Decimal.fromInt(50000));
      final res = await vm.submit();
      expect(res, isNotNull);
      expect(vm.save.result?.name, 'Spare Cash');
      expect(vm.save.error, isNull);
    });

    test(
      'MOB-4 a retry after a failed adjust updates the wallet it made',
      () async {
        final wallets = _FlakyAdjustWallets();
        final flaky = AccountFormViewModel(
          wallets: wallets,
          groups: WalletGroupsRepositoryFake(),
        );
        addTearDown(flaky.dispose);
        flaky
          ..setName('Spare Cash')
          ..setGroup('g-cash')
          ..setBalance(Decimal.fromInt(50000));

        expect(await flaky.submit(), isA<Failure<Wallet, AppError>>());
        expect(await flaky.submit(), isA<Success<Wallet, AppError>>());
        expect(wallets.creates, 1);
        expect(wallets.adjusts, 2);
      },
    );
  });
}
