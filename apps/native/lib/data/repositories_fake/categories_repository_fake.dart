import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/domain/models/category.dart';

class CategoriesRepositoryFake implements CategoriesRepository {
  CategoriesRepositoryFake({List<Category>? seed})
    : _store = (seed ??
              const [
                Category(
                  id: 'cat-food',
                  name: 'Food',
                  type: CategoryType.expense,
                  emoji: '🍜',
                ),
                Category(
                  id: 'cat-rent',
                  name: 'Rent',
                  type: CategoryType.expense,
                  emoji: '🏠',
                ),
                Category(
                  id: 'cat-salary',
                  name: 'Salary',
                  type: CategoryType.income,
                  emoji: '💰',
                ),
                Category(
                  id: 'cat-allowance',
                  name: 'Allowance',
                  type: CategoryType.income,
                  emoji: '🤑',
                ),
              ])
          .toList();

  final List<Category> _store;

  @override
  Future<Result<List<Category>, AppError>> list({CategoryType? type}) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final filtered = type == null
        ? _store
        : _store.where((c) => c.type == type).toList();
    return Success(List<Category>.unmodifiable(filtered));
  }

  @override
  Future<Result<Category, AppError>> update({
    required String id,
    required String name,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final index = _store.indexWhere((c) => c.id == id);
    if (index < 0) {
      return const Failure(
        ServerError(statusCode: 404, message: 'Category not found'),
      );
    }
    final updated = Category(
      id: _store[index].id,
      name: name,
      type: _store[index].type,
      emoji: _store[index].emoji,
    );
    _store[index] = updated;
    return Success(updated);
  }
}
