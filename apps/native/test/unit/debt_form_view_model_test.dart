import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/debts/debts_form_view_model.dart';
import 'package:oewang/data/repositories_fake/contacts_repository_fake.dart';
import 'package:oewang/data/repositories_fake/debts_repository_fake.dart';
import 'package:oewang/domain/models/contact.dart';

void main() {
  group('DebtFormViewModel.importContacts', () {
    test('creates each new candidate and skips names that already exist', () async {
      final contacts = ContactsRepositoryFake(
        initial: const [Contact(id: 'c-1', name: 'Budi Santoso')],
      );
      final vm = DebtFormViewModel(
        debts: DebtsRepositoryFake(),
        contacts: contacts,
      );
      await Future<void>.delayed(const Duration(milliseconds: 30));

      final created = await vm.importContacts([
        ('Dewi Anggraini', '+6281111111'),
        ('Rian Pratama', null),
      ]);

      expect(created, 2);
      expect(
        vm.contactOptions.map((c) => c.name),
        containsAll(['Budi Santoso', 'Dewi Anggraini', 'Rian Pratama']),
      );
      vm.dispose();
    });

    test('tolerates a per-item failure without aborting the rest', () async {
      final contacts = ContactsRepositoryFake()
        ..failNames.add('sinta wulandari');
      final vm = DebtFormViewModel(debts: DebtsRepositoryFake(), contacts: contacts);
      await Future<void>.delayed(const Duration(milliseconds: 30));

      final created = await vm.importContacts([
        ('Sinta Wulandari', null),
        ('Agus Setiawan', '+6282222222'),
      ]);

      expect(created, 1);
      expect(vm.contactOptions.map((c) => c.name), ['Agus Setiawan']);
      vm.dispose();
    });
  });
}
