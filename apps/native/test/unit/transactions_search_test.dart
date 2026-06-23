import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_search_screen.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  Transaction tx({
    String? name,
    String? description,
    NamedRef? category,
    NamedRef? wallet,
    num amount = 1000,
  }) => Transaction(
    id: 't',
    type: TransactionType.expense,
    amount: Money(amount: amount),
    date: DateTime(2026, 6, 1),
    walletId: 'w',
    name: name,
    description: description,
    category: category,
    wallet: wallet,
  );

  group('matchesQuery', () {
    test('empty query matches everything', () {
      expect(matchesQuery(tx(name: 'Coffee'), ''), isTrue);
    });

    test('matches the note (name)', () {
      expect(matchesQuery(tx(name: 'Mah Kopi'), 'kopi'), isTrue);
      expect(matchesQuery(tx(name: 'Mah Kopi'), 'tea'), isFalse);
    });

    test('matches category and wallet names', () {
      final t = tx(
        category: const NamedRef(id: 'c', name: 'Food'),
        wallet: const NamedRef(id: 'w', name: 'BCA'),
      );
      expect(matchesQuery(t, 'food'), isTrue);
      expect(matchesQuery(t, 'bca'), isTrue);
    });

    test('matches the amount digits', () {
      expect(matchesQuery(tx(amount: 110500), '1105'), isTrue);
    });

    test('no match returns false', () {
      expect(matchesQuery(tx(name: 'Coffee'), 'zzz'), isFalse);
    });
  });
}
