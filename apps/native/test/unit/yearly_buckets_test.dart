import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_yearly_buckets.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  group('bucketsForMonth', () {
    test('splits Jan 2026 into Sunday-aligned weekly buckets', () {
      final buckets = bucketsForMonth(DateTime(2026), const <Transaction>[]);
      // Jan 1 2026 is a Thursday; the first Sunday on/before is Dec 28 2025.
      // Last day is Jan 31 (Sat). So we should have 5 full weeks ending Jan 31.
      expect(buckets.length, 5);
      // Newest first.
      expect(buckets.first.start, DateTime(2026, 1, 25));
      expect(buckets.first.end, DateTime(2026, 1, 31));
      expect(buckets.last.start, DateTime(2025, 12, 28));
    });

    test('aggregates income + expense into the right bucket', () {
      final txs = <Transaction>[
        Transaction(
          id: 'a',
          type: TransactionType.expense,
          amount: const Money(amount: 100),
          date: DateTime(2026, 1, 5), // Mon — week of 04→10
          walletId: 'w',
        ),
        Transaction(
          id: 'b',
          type: TransactionType.income,
          amount: const Money(amount: 250),
          date: DateTime(2026, 1, 11), // Sun — week of 11→17
          walletId: 'w',
        ),
      ];
      final buckets = bucketsForMonth(DateTime(2026), txs);
      final weekOf05 = buckets.firstWhere(
        (b) => b.start == DateTime(2026, 1, 4),
      );
      final weekOf11 = buckets.firstWhere(
        (b) => b.start == DateTime(2026, 1, 11),
      );
      expect(weekOf05.expense.amount, 100);
      expect(weekOf11.income.amount, 250);
    });
  });

  group('isCurrentWeek', () {
    test('returns true when `now` falls between start and end', () {
      final bucket = WeeklyBucket(
        start: DateTime(2026, 1, 4),
        end: DateTime(2026, 1, 10),
        income: const Money(amount: 0),
        expense: const Money(amount: 0),
      );
      expect(isCurrentWeek(bucket, now: DateTime(2026, 1, 7)), isTrue);
      expect(isCurrentWeek(bucket, now: DateTime(2026, 1, 11)), isFalse);
    });
  });
}
