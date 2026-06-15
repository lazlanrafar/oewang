import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

/// In-memory store seeded with the fixtures that match the IMG_1826 screenshot
/// numbers (Jan 2026, IDR). Used by widget tests and previews.
class TransactionsRepositoryFake implements TransactionsRepository {
  TransactionsRepositoryFake({List<Transaction>? seed})
    : _store = seed ?? _defaultSeed();

  final List<Transaction> _store;

  static List<Transaction> _defaultSeed() {
    Transaction expense(
      String id,
      DateTime date,
      num amount,
      String category,
      String wallet,
      String walletId,
    ) {
      return Transaction(
        id: id,
        type: TransactionType.expense,
        amount: Money(amount: amount, currency: 'IDR'),
        date: date,
        walletId: walletId,
        categoryId: 'cat-$category',
        name: category,
        category: NamedRef(id: 'cat-$category', name: category),
        wallet: NamedRef(id: walletId, name: wallet),
      );
    }

    return [
      expense('t1', DateTime(2026, 1, 5), 5000, 'Food', 'Cash', 'w-cash'),
      expense('t2', DateTime(2026, 1, 5), 1800000, 'Rent', 'BCA', 'w-bca'),
      expense('t3', DateTime(2026, 1, 4), 28000, 'Laundry', 'BCA', 'w-bca'),
      expense('t4', DateTime(2026, 1, 4), 25000, 'Food', 'BCA', 'w-bca'),
      expense('t5', DateTime(2026, 1, 3), 27500, 'Food', 'BCA', 'w-bca'),
      expense('t6', DateTime(2026, 1, 2), 40000, 'Food', 'BCA', 'w-bca'),
      expense('t7', DateTime(2026, 1, 1), 27000, 'Food', 'BCA', 'w-bca'),
    ];
  }

  int _nextId = 100;

  @override
  Future<Result<Transaction, AppError>> create(
    NewTransactionDraft draft,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final created = Transaction(
      id: 'fake-${_nextId++}',
      type: draft.type,
      amount: Money(amount: draft.amount),
      date: DateTime(draft.date.year, draft.date.month, draft.date.day),
      walletId: draft.walletId,
      toWalletId: draft.toWalletId,
      categoryId: draft.categoryId,
      name: draft.note,
      description: draft.description,
    );
    _store.insert(0, created);
    return Success(created);
  }

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final from = DateTime(query.from.year, query.from.month, query.from.day);
    final to = DateTime(query.to.year, query.to.month, query.to.day);
    final filtered = _store.where((t) {
      final inRange =
          !t.date.isBefore(from) && !t.date.isAfter(to);
      final typeOk = query.type == null || t.type == query.type;
      return inRange && typeOk;
    }).toList()..sort((a, b) => b.date.compareTo(a.date));
    return Success(filtered);
  }
}
