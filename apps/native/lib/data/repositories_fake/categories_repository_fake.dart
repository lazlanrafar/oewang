import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/domain/models/category.dart';

class CategoriesRepositoryFake implements CategoriesRepository {
  CategoriesRepositoryFake({List<Category>? seed})
    : _store = seed ??
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
            ];

  final List<Category> _store;

  @override
  Future<Result<List<Category>, AppError>> list({CategoryType? type}) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final filtered = type == null
        ? _store
        : _store.where((c) => c.type == type).toList();
    return Success(List<Category>.unmodifiable(filtered));
  }
}
