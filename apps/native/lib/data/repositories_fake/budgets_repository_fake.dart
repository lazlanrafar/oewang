import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

/// In-memory budgets. It plays the API, so it works out the figures the API
/// would send; nothing outside a fake does (D27).
class BudgetsRepositoryFake implements BudgetsRepository {
  BudgetsRepositoryFake({List<BudgetStatus>? seed})
    : _store = List<BudgetStatus>.of(seed ?? _seed);

  static final _seed = <BudgetStatus>[
    _line('b-food', 'cat-food', 'Food', 1500000, 124500),
    _line('b-rent', 'cat-rent', 'Rent', 2000000, 1800000),
  ];

  static BudgetStatus _line(
    String id,
    String categoryId,
    String name,
    int amount,
    int spent,
  ) => BudgetStatus(
    id: id,
    categoryId: categoryId,
    categoryName: name,
    amount: Money(amount: Decimal.fromInt(amount)),
    spent: Money(amount: Decimal.fromInt(spent)),
    remaining: Money(amount: Decimal.fromInt(amount - spent)),
    percentage: amount == 0 ? 0 : spent * 100 ~/ amount,
  );

  final List<BudgetStatus> _store;
  var _seq = 0;

  @override
  Future<Result<BudgetMonth, AppError>> status({int? month, int? year}) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    var budget = Money.zero();
    var spent = Money.zero();
    for (final b in _store) {
      budget += b.amount;
      spent += b.spent;
    }
    final percent = budget.isZero
        ? 0
        : (spent.amount * Decimal.fromInt(100) / budget.amount).floor().toInt();
    return Success(
      BudgetMonth(
        totals: BudgetTotals(
          totalBudget: budget,
          totalSpent: spent,
          remaining: budget - spent,
          percent: percent,
        ),
        budgets: List<BudgetStatus>.unmodifiable(_store),
      ),
    );
  }

  @override
  Future<Result<void, AppError>> create({
    required String categoryId,
    required Decimal amount,
  }) async {
    _store.add(
      BudgetStatus(
        id: 'b-fake-${_seq++}',
        categoryId: categoryId,
        categoryName: categoryId,
        amount: Money(amount: amount),
        spent: Money.zero(),
        remaining: Money(amount: amount),
        percentage: 0,
      ),
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> update({
    required String id,
    required Decimal amount,
  }) async {
    final i = _store.indexWhere((b) => b.id == id);
    if (i == -1) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Budget not found'),
      );
    }
    final b = _store[i];
    _store[i] = BudgetStatus(
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      amount: Money(amount: amount),
      spent: b.spent,
      remaining: Money(amount: amount - b.spent.amount),
      percentage: b.percentage,
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    _store.removeWhere((b) => b.id == id);
    return const Success(null);
  }
}
