import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

/// In-memory, deterministic. For widget and unit tests only.
class TransactionsRepositoryFake implements TransactionsRepository {
  TransactionsRepositoryFake({List<Transaction>? seed, this.currency = 'IDR'})
    : _items = [...?seed];

  final String currency;
  final List<Transaction> _items;
  int _nextId = 1;

  List<Transaction> get items => List.unmodifiable(_items);

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    final inRange =
        _items
            .where(
              (t) =>
                  !t.date.isBefore(_day(query.from)) &&
                  !t.date.isAfter(_day(query.to)) &&
                  (query.type == null || t.type == query.type),
            )
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date));
    return Success(
      inRange.skip((query.page - 1) * query.limit).take(query.limit).toList(),
    );
  }

  @override
  Future<Result<TransactionsSummary, AppError>> summary({
    required DateTime from,
    required DateTime to,
  }) async {
    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final t in _items) {
      if (t.date.isBefore(_day(from)) || t.date.isAfter(_day(to))) continue;
      if (t.isIncome) income += t.baseAmount;
      if (t.isExpense) expense += t.baseAmount;
    }
    return Success(
      TransactionsSummary(
        currency: currency,
        income: Money(amount: income, currency: currency),
        expense: Money(amount: expense, currency: currency),
      ),
    );
  }

  @override
  Future<Result<Transaction, AppError>> create(
    NewTransactionDraft draft,
  ) async {
    final created = _from('fake-${_nextId++}', draft);
    _items.add(created);
    return Success(created);
  }

  @override
  Future<Result<Transaction, AppError>> update(
    String id,
    NewTransactionDraft draft,
  ) async {
    final i = _items.indexWhere((t) => t.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(
          statusCode: 404,
          message: 'Transaction not found',
          code: 'TRANSACTION_NOT_FOUND',
        ),
      );
    }
    return Success(_items[i] = _from(id, draft));
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    _items.removeWhere((t) => t.id == id);
    return const Success<void, AppError>(null);
  }

  Transaction _from(String id, NewTransactionDraft d) => Transaction(
    id: id,
    type: d.type,
    amount: Money(amount: d.amount, currency: currency),
    date: _day(d.date),
    walletId: d.walletId,
    toWalletId: d.toWalletId,
    categoryId: d.categoryId,
    name: d.note,
    description: d.description,
  );

  static DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);
}
