import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/sub_currencies_repository_fake.dart';
import 'package:oewang/domain/models/sub_currency.dart';

void main() {
  group('SubCurrenciesRepositoryFake', () {
    test('list returns the seeded sub-currencies', () async {
      final repo = SubCurrenciesRepositoryFake();
      final res = await repo.list();
      final list = res.fold((ok) => ok, (_) => const <SubCurrency>[]);
      expect(list.map((s) => s.currencyCode), containsAll(['SGD', 'USD']));
    });

    test('create appends and persists across reads', () async {
      final repo = SubCurrenciesRepositoryFake(seed: const []);
      final res = await repo.create('EUR');
      expect(res.isOk, isTrue);
      final list = await repo.list();
      final codes = list.fold(
        (ok) => ok.map((s) => s.currencyCode).toList(),
        (_) => <String>[],
      );
      expect(codes, ['EUR']);
    });

    test('create rejects duplicates with a Failure', () async {
      final repo = SubCurrenciesRepositoryFake();
      final res = await repo.create('SGD');
      expect(res.isErr, isTrue);
    });

    test('delete removes the row', () async {
      final repo = SubCurrenciesRepositoryFake();
      await repo.delete('sc-sgd');
      final list = await repo.list();
      final codes = list.fold(
        (ok) => ok.map((s) => s.currencyCode).toList(),
        (_) => <String>[],
      );
      expect(codes, isNot(contains('SGD')));
    });
  });
}
