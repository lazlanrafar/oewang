import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  group('TransactionDto.fromJson', () {
    test('parses an expense with joined wallet + category', () {
      final dto = TransactionDto.fromJson({
        'id': 't-1',
        'type': 'expense',
        'amount': 5000,
        'currency': 'IDR',
        'date': '2026-01-05',
        'walletId': 'w-cash',
        'categoryId': 'cat-food',
        'name': 'Nasi Jinggo',
        'wallet': {'id': 'w-cash', 'name': 'Cash'},
        'category': {'id': 'cat-food', 'name': 'Food'},
      });

      final tx = dto.toDomain();
      expect(tx.type, TransactionType.expense);
      expect(tx.amount.amount, 5000);
      expect(tx.amount.currency, 'IDR');
      expect(tx.date, DateTime(2026, 1, 5));
      expect(tx.wallet?.name, 'Cash');
      expect(tx.category?.name, 'Food');
    });

    test('accepts snake_case wallet_id fallback', () {
      final dto = TransactionDto.fromJson({
        'id': 't-2',
        'type': 'income',
        'amount': '1500.5',
        'date': '2026-01-04',
        'wallet_id': 'w-bca',
      });

      final tx = dto.toDomain();
      expect(tx.type, TransactionType.income);
      expect(tx.amount.amount, 1500.5);
      expect(tx.walletId, 'w-bca');
    });

    test('falls back to expense on unknown wire type', () {
      final dto = TransactionDto.fromJson({
        'id': 't-3',
        'type': 'mystery',
        'amount': 0,
        'date': '2026-01-01',
        'walletId': 'w-x',
      });
      expect(dto.toDomain().type, TransactionType.expense);
    });
  });
}
