import 'package:flutter/foundation.dart' hide Category;
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';

class TransactionFormState {
  const TransactionFormState({
    required this.type,
    required this.date,
    required this.amount,
    this.walletId,
    this.categoryId,
    this.note = '',
    this.description = '',
  });

  factory TransactionFormState.initial() => TransactionFormState(
    type: TransactionType.expense,
    date: _today(),
    amount: 0,
  );

  final TransactionType type;
  final DateTime date;
  final num amount;
  final String? walletId;
  final String? categoryId;
  final String note;
  final String description;

  bool get isValid =>
      amount > 0 &&
      walletId != null &&
      (type == TransactionType.transfer || categoryId != null);

  TransactionFormState copyWith({
    TransactionType? type,
    DateTime? date,
    num? amount,
    String? walletId,
    String? categoryId,
    String? note,
    String? description,
  }) {
    return TransactionFormState(
      type: type ?? this.type,
      date: date ?? this.date,
      amount: amount ?? this.amount,
      walletId: walletId ?? this.walletId,
      categoryId: categoryId ?? this.categoryId,
      note: note ?? this.note,
      description: description ?? this.description,
    );
  }

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }
}

/// Owns the Income / Expense transaction form state and the Save Command.
class TransactionFormViewModel extends ChangeNotifier {
  TransactionFormViewModel({
    required TransactionsRepository transactions,
    required WalletsRepository wallets,
    required CategoriesRepository categories,
  }) : _transactions = transactions,
       _wallets = wallets,
       _categories = categories {
    save = Command<NewTransactionDraft, Transaction>(_transactions.create)
      ..addListener(notifyListeners);
    _loadPickers();
  }

  final TransactionsRepository _transactions;
  final WalletsRepository _wallets;
  final CategoriesRepository _categories;

  TransactionFormState _state = TransactionFormState.initial();
  List<Wallet> _walletOptions = const [];
  List<Category> _categoryOptions = const [];
  bool _loadingPickers = true;

  late final Command<NewTransactionDraft, Transaction> save;

  TransactionFormState get state => _state;
  List<Wallet> get walletOptions => _walletOptions;
  List<Category> get categoryOptions => _categoryOptions
      .where((c) => _categoryMatchesType(c, _state.type))
      .toList();
  bool get loadingPickers => _loadingPickers;
  bool get canSave => _state.isValid && !save.running;

  void setType(TransactionType type) {
    _state = TransactionFormState(
      type: type,
      date: _state.date,
      amount: _state.amount,
      walletId: _state.walletId,
      note: _state.note,
      description: _state.description,
    );
    notifyListeners();
  }

  void setDate(DateTime date) {
    _state = _state.copyWith(date: DateTime(date.year, date.month, date.day));
    notifyListeners();
  }

  void setAmount(num amount) {
    _state = _state.copyWith(amount: amount);
    notifyListeners();
  }

  void setWallet(String walletId) {
    _state = _state.copyWith(walletId: walletId);
    notifyListeners();
  }

  void setCategory(String categoryId) {
    _state = _state.copyWith(categoryId: categoryId);
    notifyListeners();
  }

  void setNote(String note) {
    _state = _state.copyWith(note: note);
    notifyListeners();
  }

  void setDescription(String description) {
    _state = _state.copyWith(description: description);
    notifyListeners();
  }

  Future<Result<Transaction, AppError>?> submit() async {
    if (!_state.isValid) return null;
    final draft = NewTransactionDraft(
      type: _state.type,
      amount: _state.amount,
      date: _state.date,
      walletId: _state.walletId!,
      categoryId: _state.categoryId,
      note: _state.note.isEmpty ? null : _state.note,
      description: _state.description.isEmpty ? null : _state.description,
    );
    await save.run(draft);
    final ok = save.result;
    if (ok != null) return Success<Transaction, AppError>(ok);
    final err = save.error;
    if (err != null) return Failure<Transaction, AppError>(err);
    return null;
  }

  void resetForContinue() {
    save.reset();
    _state = _state.copyWith(amount: 0, note: '', description: '');
    notifyListeners();
  }

  Future<void> _loadPickers() async {
    final walletsRes = await _wallets.list();
    walletsRes.fold((w) => _walletOptions = w, (_) => _walletOptions = const []);
    final catsRes = await _categories.list();
    catsRes.fold(
      (c) => _categoryOptions = c,
      (_) => _categoryOptions = const [],
    );
    _loadingPickers = false;
    notifyListeners();
  }

  bool _categoryMatchesType(Category c, TransactionType t) {
    return switch (t) {
      TransactionType.income => c.type == CategoryType.income,
      TransactionType.expense => c.type == CategoryType.expense,
      _ => true,
    };
  }

  @override
  void dispose() {
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
