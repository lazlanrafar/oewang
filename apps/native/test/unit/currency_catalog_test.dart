import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/dto/currency_catalog.dart';

void main() {
  group('CurrencyCatalog', () {
    test('search is case-insensitive over code + country', () {
      final byCode = CurrencyCatalog.search('idr');
      expect(byCode.map((c) => c.code), contains('IDR'));
      final byCountry = CurrencyCatalog.search('singapore');
      expect(byCountry.map((c) => c.code), contains('SGD'));
    });

    test('empty query returns the full catalog', () {
      expect(
        CurrencyCatalog.search('  ').length,
        CurrencyCatalog.all.length,
      );
    });

    test('groupByLetter alphabetises by code initial', () {
      final grouped = CurrencyCatalog.groupByLetter(
        CurrencyCatalog.search('K'),
      );
      expect(grouped.containsKey('K'), isTrue);
      expect(grouped['K'], isNotEmpty);
    });
  });
}
