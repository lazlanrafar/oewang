import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

class BudgetsRepositoryFake implements BudgetsRepository {
  BudgetsRepositoryFake({List<BudgetStatus>? seed})
    : _store = List<BudgetStatus>.of(seed ?? _seed);

  static const _seed = <BudgetStatus>[
    BudgetStatus(
      id: 'b-food',
      categoryId: 'cat-food',
      categoryName: 'Food',
      amount: Money(amount: 1500000),
      spent: Money(amount: 124500),
      percentage: 8,
    ),
    BudgetStatus(
      id: 'b-rent',
      categoryId: 'cat-rent',
      categoryName: 'Rent',
      amount: Money(amount: 2000000),
      spent: Money(amount: 1800000),
      percentage: 90,
    ),
  ];

  final List<BudgetStatus> _store;
  var _seq = 0;

  @override
  Future<Result<List<BudgetStatus>, AppError>> status({
    int? month,
    int? year,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<BudgetStatus>.unmodifiable(_store));
  }

  @override
  Future<Result<void, AppError>> create({
    required String categoryId,
    required num amount,
  }) async {
    _store.add(
      BudgetStatus(
        id: 'b-fake-${_seq++}',
        categoryId: categoryId,
        categoryName: categoryId,
        amount: Money(amount: amount),
        spent: Money.zero(),
        percentage: 0,
      ),
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> update({
    required String id,
    required num amount,
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
