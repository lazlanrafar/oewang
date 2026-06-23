import 'package:flutter/foundation.dart' hide Category;
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/category.dart';

class BudgetFormState {
  const BudgetFormState({this.categoryId, this.amount = 0});

  final String? categoryId;
  final num amount;

  bool get isValid => categoryId != null && amount > 0;

  BudgetFormState copyWith({String? categoryId, num? amount}) => BudgetFormState(
    categoryId: categoryId ?? this.categoryId,
    amount: amount ?? this.amount,
  );
}

/// Owns the budget form state and the Save command (create or update).
class BudgetFormViewModel extends ChangeNotifier {
  BudgetFormViewModel({
    required BudgetsRepository budgets,
    required CategoriesRepository categories,
    BudgetStatus? editing,
  }) : _budgets = budgets,
       _categories = categories,
       _editingId = editing?.id,
       _editingCategoryName = editing?.categoryName {
    if (editing != null) {
      _state = BudgetFormState(
        categoryId: editing.categoryId,
        amount: editing.amount.amount,
      );
    }
    save = Command<void, void>(_runSave)..addListener(notifyListeners);
    if (!isEditing) _loadCategories();
  }

  final BudgetsRepository _budgets;
  final CategoriesRepository _categories;
  final String? _editingId;
  final String? _editingCategoryName;

  bool get isEditing => _editingId != null;
  String get editingCategoryName => _editingCategoryName ?? '';

  BudgetFormState _state = const BudgetFormState();
  List<Category> _categoryOptions = const [];

  late final Command<void, void> save;

  BudgetFormState get state => _state;
  List<Category> get categoryOptions => _categoryOptions;
  bool get canSave => _state.isValid && !save.running;

  void setCategory(String id) {
    _state = _state.copyWith(categoryId: id);
    notifyListeners();
  }

  void setAmount(num amount) {
    _state = _state.copyWith(amount: amount);
    notifyListeners();
  }

  Future<Result<void, AppError>?> submit() async {
    if (!_state.isValid) return null;
    await save.run(null);
    final err = save.error;
    if (err != null) return Failure<void, AppError>(err);
    return const Success<void, AppError>(null);
  }

  Future<Result<void, AppError>> _runSave(void _) {
    final id = _editingId;
    return id == null
        ? _budgets.create(categoryId: _state.categoryId!, amount: _state.amount)
        : _budgets.update(id: id, amount: _state.amount);
  }

  Future<void> _loadCategories() async {
    final res = await _categories.list(type: CategoryType.expense);
    res.fold(
      (cs) => _categoryOptions = cs,
      (_) => _categoryOptions = const [],
    );
    notifyListeners();
  }

  @override
  void dispose() {
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
