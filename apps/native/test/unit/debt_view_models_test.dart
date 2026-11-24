import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/debts/debts_form_view_model.dart';
import 'package:oewang/components/organisms/debts/debts_pay_view_model.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_fake/contacts_repository_fake.dart';
import 'package:oewang/data/repositories_fake/debts_repository_fake.dart';
import 'package:oewang/data/repositories_fake/rates_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/contact.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';

Decimal d(String s) => Decimal.parse(s);

Debt debt({
  String amount = '100',
  String remaining = '100',
  String currency = 'IDR',
  DebtType type = DebtType.receivable,
}) => Debt(
  id: 'debt-1',
  contactId: 'c-budi',
  contactName: 'Budi',
  type: type,
  amount: Money(amount: d(amount), currency: currency),
  remainingAmount: Money(amount: d(remaining), currency: currency),
  status: DebtStatus.of(amount: d(amount), remaining: d(remaining)),
);

Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 30));

void main() {
  group('DEBT-16 debt form', () {
    test('creates a debt with the chosen contact, type and amount', () async {
      final debts = DebtsRepositoryFake(contactNames: {'c-budi': 'Budi'});
      final vm = DebtFormViewModel(
        debts: debts,
        contacts: ContactsRepositoryFake(
          seed: const [Contact(id: 'c-budi', name: 'Budi')],
        ),
      );
      await settle();
      expect(vm.contactOptions.map((c) => c.name), ['Budi']);
      expect(vm.canSave, isFalse);

      vm
        ..setContact('c-budi')
        ..setType(DebtType.payable)
        ..setAmount(d('250000'));
      expect(vm.canSave, isTrue);
      expect(await vm.submit(), isA<Success<void, Object>>());

      final saved = (await debts.list()).fold((l) => l.single, (_) => null)!;
      expect(saved.contactName, 'Budi');
      expect(saved.type, DebtType.payable);
      expect(saved.remainingAmount.amount, d('250000'));
      expect(saved.status, DebtStatus.unpaid);
      vm.dispose();
    });

    test('a new contact made in the form is selected', () async {
      final vm = DebtFormViewModel(
        debts: DebtsRepositoryFake(),
        contacts: ContactsRepositoryFake(),
      );
      await settle();
      await vm.addContact('Ani');
      expect(vm.contactOptions.single.name, 'Ani');
      expect(vm.state.contactId, vm.contactOptions.single.id);
      vm.dispose();
    });

    test(
      'DEBT-16: an amount below what is paid shows the API refusal',
      () async {
        final existing = debt(remaining: '40'); // 60 paid
        final vm = DebtFormViewModel(
          debts: DebtsRepositoryFake(seed: [existing]),
          contacts: ContactsRepositoryFake(),
          editing: existing,
        )..setAmount(d('50'));
        expect(vm.isEditing, isTrue);
        expect(await vm.submit(), isA<Failure<void, Object>>());
        expect(vm.save.error?.code, 'AMOUNT_BELOW_PAID');
        vm.dispose();
      },
    );
  });

  group('DEBT-16 payment', () {
    PayDebtViewModel payVm(
      DebtsRepositoryFake debts,
      Debt target, {
      List<Wallet>? wallets,
      Map<String, double>? rates,
    }) => PayDebtViewModel(
      debt: target,
      debts: debts,
      wallets: WalletsRepositoryFake(seed: wallets),
      rates: RatesRepositoryFake(seed: rates),
      today: DateTime(2026, 11, 24),
    );

    test('prefills the remaining amount and pays it off', () async {
      final target = debt(remaining: '75');
      final debts = DebtsRepositoryFake(seed: [target]);
      final vm = payVm(debts, target);
      expect(vm.amount, d('75'));
      expect(await vm.submit(), isTrue);

      final after = (await debts.list()).fold((l) => l.single, (_) => null)!;
      expect(after.status, DebtStatus.paid);
      expect(debts.paid.single.date, DateTime(2026, 11, 24));
      expect(debts.paid.single.walletId, isNull);
      vm.dispose();
    });

    test('refuses more than the remaining amount before sending', () async {
      final target = debt(remaining: '30');
      final debts = DebtsRepositoryFake(seed: [target]);
      final vm = payVm(debts, target)..setAmount(d('31'));
      expect(await vm.submit(), isFalse);
      expect(vm.error, contains('remaining'));
      expect(debts.paid, isEmpty);
      vm.dispose();
    });

    test('a wallet in another currency needs a rate, prefilled and '
        'editable, and the wallet amount follows it', () async {
      final target = debt(amount: '100', remaining: '100', currency: 'USD');
      final debts = DebtsRepositoryFake(seed: [target]);
      final bca = Wallet(id: 'w-bca', name: 'BCA');
      final vm = payVm(debts, target, wallets: [bca], rates: {'IDR': 16250});
      await vm.setWallet(bca);
      expect(vm.needsRate, isTrue);
      expect(vm.rateField.text, '16250');
      expect(vm.walletAmount, d('1625000'));

      vm.rateField.text = '16000';
      vm.rateChanged('16000');
      expect(vm.walletAmount, d('1600000'));
      expect(await vm.submit(), isTrue);
      expect(debts.paid.single.exchangeRate, d('16000'));
      expect(debts.paid.single.walletId, 'w-bca');
      vm.dispose();
    });

    test('a wallet in the debt currency sends no rate', () async {
      final target = debt();
      final debts = DebtsRepositoryFake(seed: [target]);
      final cash = Wallet(id: 'w-cash', name: 'Cash');
      final vm = payVm(debts, target, wallets: [cash]);
      await vm.setWallet(cash);
      expect(vm.needsRate, isFalse);
      expect(await vm.submit(), isTrue);
      expect(debts.paid.single.exchangeRate, isNull);
      vm.dispose();
    });
  });
}
