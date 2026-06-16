import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/repositories_fake/rates_repository_fake.dart';

void main() {
  group('RatesRepositoryFake', () {
    test('default seed contains IDR / SGD / USD', () async {
      final repo = RatesRepositoryFake();
      final res = await repo.rates(base: 'IDR');
      final map = res.fold(
        (ok) => ok,
        (_) => const <String, double>{},
      );
      expect(map.containsKey('SGD'), isTrue);
      expect(map.containsKey('USD'), isTrue);
      // 1/rate gives the IDR-per-unit display value.
      final sgdInIdr = 1 / map['SGD']!;
      expect(sgdInIdr.round(), 13320);
    });
  });
}
