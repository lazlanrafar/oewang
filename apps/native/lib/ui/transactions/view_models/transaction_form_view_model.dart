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
    this.toWalletId,
    this.categoryId,
    this.fees = 0,
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
  final String? toWalletId;
  final String? categoryId;
  final num fees;
  final String note;
  final String description;

  bool get isValid {
    if (amount <= 0) return false;
    return switch (type) {
      TransactionType.transfer =>
        walletId != null && toWalletId != null && walletId != toWalletId,
      TransactionType.income || TransactionType.expense =>
        walletId != null && categoryId != null,
      _ => walletId != null,
    };
  }

  TransactionFormState copyWith({
    TransactionType? type,
    DateTime? date,
    num? amount,
    String? walletId,
    String? toWalletId,
    String? categoryId,
    num? fees,
    String? note,
    String? description,
  }) {
    return TransactionFormState(
      type: type ?? this.type,
      date: date ?? this.date,
      amount: amount ?? this.amount,
      walletId: walletId ?? this.walletId,
      toWalletId: toWalletId ?? this.toWalletId,
      categoryId: categoryId ?? this.categoryId,
      fees: fees ?? this.fees,
      note: note ?? this.note,
      description: description ?? this.description,
    );
  }

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }
}

/// Owns the transaction form state and the Save Command.
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
    // Reset to a clean state for the new type — copyWith can't null out
    // categoryId / toWalletId because `null` collapses to the old value.
    _state = TransactionFormState(
      type: type,
      date: _state.date,
      amount: _state.amount,
      walletId: type == TransactionType.transfer ? _state.walletId : _state.walletId,
      toWalletId: type == TransactionType.transfer ? _state.toWalletId : null,
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

  void setToWallet(String walletId) {
    _state = _state.copyWith(toWalletId: walletId);
    notifyListeners();
  }

  void swapWallets() {
    if (_state.walletId == null || _state.toWalletId == null) return;
    _state = TransactionFormState(
      type: _state.type,
      date: _state.date,
      amount: _state.amount,
      walletId: _state.toWalletId,
      toWalletId: _state.walletId,
      fees: _state.fees,
      note: _state.note,
      description: _state.description,
    );
    notifyListeners();
  }

  void setCategory(String categoryId) {
    _state = _state.copyWith(categoryId: categoryId);
    notifyListeners();
  }

  void setFees(num fees) {
    _state = _state.copyWith(fees: fees);
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
    final note = _composeNote();
    final draft = NewTransactionDraft(
      type: _state.type,
      amount: _state.amount,
      date: _state.date,
      walletId: _state.walletId!,
      toWalletId: _state.toWalletId,
      categoryId: _state.type == TransactionType.transfer
          ? null
          : _state.categoryId,
      note: note,
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
    _state = _state.copyWith(amount: 0, fees: 0, note: '', description: '');
    notifyListeners();
  }

  /// Fees aren't a column on the wire model. We tack the value into the note
  /// for transfer transactions so the user still sees it on the daily list.
  String? _composeNote() {
    if (_state.type != TransactionType.transfer || _state.fees <= 0) {
      return _state.note.isEmpty ? null : _state.note;
    }
    final feesText = 'Fee: ${_state.fees}';
    return _state.note.isEmpty ? feesText : '${_state.note} ($feesText)';
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
