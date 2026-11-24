import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_view_model.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

/// The totals read has no connection and nothing cached.
class _NoTotals extends WalletsRepositoryFake {
  @override
  Future<Result<WalletTotals, AppError>> totals() async =>
      const Failure(NetworkError());
}

Money _idr(int v) => Money(amount: Decimal.fromInt(v));

void main() {
  group('AccountsViewModel', () {
    test('MOB-4 shows the API totals and group subtotals', () async {
      final vm = AccountsViewModel(
        wallets: WalletsRepositoryFake(),
        groups: WalletGroupsRepositoryFake(),
      );
      await vm.ready;

      expect(vm.assets.amount, Decimal.fromInt(660999));
      expect(vm.liabilities.amount, Decimal.fromInt(2079000));
      expect(vm.total.amount, Decimal.fromInt(-1418001));
      expect(vm.sections.length, 3); // Cash, Accounts, Debit Card
      expect(vm.sections.first.group.name, 'Cash');
      expect(vm.sections.first.subtotal.amount, Decimal.fromInt(625000));
      expect(vm.sections[1].group.name, 'Accounts');
      expect(vm.sections[1].subtotal.amount, Decimal.fromInt(-95501));
      vm.dispose();
    });

    test('MOB-4 a foreign wallet keeps its own balance in its row; the total '
        'and the left-out count come from the API', () async {
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
          totalsSeed: WalletTotals(
            total: _idr(801000),
            assets: _idr(801000),
            liabilities: _idr(0),
            leftOut: 1,
            groups: [GroupTotal(id: null, subtotal: _idr(801000))],
          ),
        ),
        groups: WalletGroupsRepositoryFake(seed: const []),
      );
      await vm.ready;

      expect(vm.total.amount, Decimal.fromInt(801000));
      expect(vm.leftOut, 1);
      final others = vm.sections.single;
      expect(others.group.name, 'Others');
      expect(others.subtotal.amount, Decimal.fromInt(801000));
      expect(others.wallets.last.currency, 'USD');
      expect(others.wallets.last.balance, Decimal.fromInt(50));
      vm.dispose();
    });

    test('has no sections without wallets', () async {
      final vm = AccountsViewModel(
        wallets: WalletsRepositoryFake(seed: const []),
        groups: WalletGroupsRepositoryFake(seed: const []),
      );
      await vm.ready;
      expect(vm.sections, isEmpty);
      vm.dispose();
    });

    test('MOB-6 says why it cannot add up when no totals were ever '
        'fetched', () async {
      final vm = AccountsViewModel(
        wallets: _NoTotals(),
        groups: WalletGroupsRepositoryFake(),
      );
      await vm.ready;
      expect(vm.error, isA<NetworkError>());
      vm.dispose();
    });
  });

  test('MOB-4 the note says how many were left out and when it is an '
      'estimate', () {
    expect(totalsNote(leftOut: 0, estimate: false), isNull);
    expect(totalsNote(leftOut: 2, estimate: false), '2 left out, no rate');
    expect(
      totalsNote(leftOut: 1, estimate: true),
      '1 left out, no rate · Estimate, syncing',
    );
  });
}
