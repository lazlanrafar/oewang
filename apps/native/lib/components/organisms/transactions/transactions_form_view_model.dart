import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart' hide Category;
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/receipt_draft.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/vault_file.dart';
import 'package:oewang/domain/models/wallet.dart';

class TransactionFormState {
  const TransactionFormState({
    required this.type,
    required this.date,
    required this.amount,
    this.walletId,
    this.toWalletId,
    this.categoryId,
    this.fees,
    this.note = '',
    this.description = '',
    this.attachmentIds = const [],
  });

  factory TransactionFormState.initial() => TransactionFormState(
    type: TransactionType.expense,
    date: _today(),
    amount: Decimal.zero,
  );

  final TransactionType type;
  final DateTime date;
  final Decimal amount;
  final String? walletId;
  final String? toWalletId;
  final String? categoryId;
  final Decimal? fees;
  final String note;
  final String description;

  /// Vault file ids of uploaded receipt images, in add order — grown by
  /// [TransactionFormViewModel.addAttachment], shrunk by
  /// [TransactionFormViewModel.removeAttachment].
  final List<String> attachmentIds;

  bool get isValid {
    if (amount <= Decimal.zero) return false;
    return switch (type) {
      TransactionType.transfer =>
        walletId != null && toWalletId != null && walletId != toWalletId,
      TransactionType.income ||
      TransactionType.expense => walletId != null && categoryId != null,
      _ => walletId != null,
    };
  }

  TransactionFormState copyWith({
    TransactionType? type,
    DateTime? date,
    Decimal? amount,
    String? walletId,
    String? toWalletId,
    String? categoryId,
    Decimal? fees,
    String? note,
    String? description,
    List<String>? attachmentIds,
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
      attachmentIds: attachmentIds ?? this.attachmentIds,
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
    required VaultRepository vault,
    Transaction? editing,
    ReceiptDraft? receipt,
  }) : _transactions = transactions,
       _wallets = wallets,
       _categories = categories,
       _vault = vault,
       _editingId = editing?.id {
    if (editing != null) _state = _stateFrom(editing);
    if (receipt != null) _state = _stateFromReceipt(receipt);
    save = Command<NewTransactionDraft, Transaction>(_runSave)
      ..addListener(notifyListeners);
    _loadPickers();
  }

  final TransactionsRepository _transactions;
  final WalletsRepository _wallets;
  final CategoriesRepository _categories;
  final VaultRepository _vault;
  final String? _editingId;

  bool get isEditing => _editingId != null;

  TransactionFormState _state = TransactionFormState.initial();
  List<Wallet> _walletOptions = const [];
  List<Category> _categoryOptions = const [];
  List<Transaction> _transactionsHistory = const [];
  bool _loadingPickers = true;

  late final Command<NewTransactionDraft, Transaction> save;

  /// Uploads a picked receipt image to the vault. Multiple images can be
  /// in flight at once (one per grid tile), so this is a plain call rather
  /// than a shared [Command] — the View tracks each tile's own
  /// loading/error state and calls [addAttachment] on success.
  Future<Result<VaultFile, AppError>> uploadAttachment(File file) =>
      _vault.upload(file);

  void addAttachment(String id) {
    _state = _state.copyWith(attachmentIds: [..._state.attachmentIds, id]);
    notifyListeners();
  }

  /// Detaches one receipt image (doesn't delete it from the vault — it may
  /// still be referenced elsewhere, or the user just changed their mind).
  void removeAttachment(String id) {
    _state = _state.copyWith(
      attachmentIds: _state.attachmentIds.where((a) => a != id).toList(),
    );
    notifyListeners();
  }

  TransactionFormState get state => _state;
  List<Wallet> get walletOptions => _walletOptions;
  List<Category> get categoryOptions => _categoryOptions
      .where((c) => _categoryMatchesType(c, _state.type))
      .toList();
  List<Transaction> get transactionsHistory => _transactionsHistory;
  bool get loadingPickers => _loadingPickers;
  bool get canSave => _state.isValid && !save.running;

  void setType(TransactionType type) {
    // Reset to a clean state for the new type — copyWith can't null out
    // categoryId / toWalletId because `null` collapses to the old value.
    _state = TransactionFormState(
      type: type,
      date: _state.date,
      amount: _state.amount,
      walletId: type == TransactionType.transfer
          ? _state.walletId
          : _state.walletId,
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

  void setAmount(Decimal amount) {
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

  void setFees(Decimal fees) {
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
      attachmentIds: _state.attachmentIds.isEmpty ? null : _state.attachmentIds,
    );
    await save.run(draft);
    final ok = save.result;
    if (ok != null) return Success<Transaction, AppError>(ok);
    final err = save.error;
    if (err != null) return Failure<Transaction, AppError>(err);
    return null;
  }

  /// Deletes the transaction being edited (TXN-5). The API reverses its
  /// balance; a viewer never gets here (MOB-5) and the API refuses anyway.
  Future<Result<void, AppError>> delete() async {
    final id = _editingId;
    if (id == null) return const Failure(UnknownError('Nothing to delete'));
    return _transactions.delete(id);
  }

  /// Dispatches the Save command to create (new) or update (editing).
  Future<Result<Transaction, AppError>> _runSave(NewTransactionDraft draft) {
    final id = _editingId;
    return id == null
        ? _transactions.create(draft)
        : _transactions.update(id, draft);
  }

  /// Seeds the form from an existing transaction for edit mode.
  static TransactionFormState _stateFrom(Transaction t) {
    final type = switch (t.type) {
      TransactionType.income => TransactionType.income,
      TransactionType.transfer ||
      TransactionType.transferIn ||
      TransactionType.transferOut => TransactionType.transfer,
      _ => TransactionType.expense,
    };
    return TransactionFormState(
      type: type,
      date: DateTime(t.date.year, t.date.month, t.date.day),
      amount: t.amount.amount,
      walletId: t.walletId,
      toWalletId: t.toWalletId,
      categoryId: t.categoryId,
      note: t.name ?? '',
      description: t.description ?? '',
      attachmentIds: t.attachments.map((a) => a.id).toList(),
    );
  }

  /// Seeds a new expense from a scanned receipt, the image already
  /// attached (AI-3). What the reader could not answer stays empty for the
  /// person to fill; nothing is saved until they do (AI-2).
  static TransactionFormState _stateFromReceipt(ReceiptDraft r) {
    final initial = TransactionFormState.initial();
    return TransactionFormState(
      type: TransactionType.expense,
      date: r.date ?? initial.date,
      amount: r.total ?? Decimal.zero,
      note: r.merchant ?? '',
      attachmentIds: [r.vaultFileId],
    );
  }

  void resetForContinue() {
    save.reset();
    _state = TransactionFormState(
      type: _state.type,
      date: _state.date,
      walletId: _state.walletId,
      toWalletId: _state.toWalletId,
      categoryId: _state.categoryId,
      amount: Decimal.zero,
      note: '',
      description: '',
    );
    notifyListeners();
  }

  /// Fees aren't a column on the wire model. We tack the value into the note
  /// for transfer transactions so the user still sees it on the daily list.
  String? _composeNote() {
    final fees = _state.fees;
    if (_state.type != TransactionType.transfer ||
        fees == null ||
        fees <= Decimal.zero) {
      return _state.note.isEmpty ? null : _state.note;
    }
    final feesText = 'Fee: $fees';
    return _state.note.isEmpty ? feesText : '${_state.note} ($feesText)';
  }

  bool _disposed = false;

  Future<void> _loadPickers() async {
    final walletsRes = await _wallets.list();
    walletsRes.fold(
      (w) => _walletOptions = w,
      (_) => _walletOptions = const [],
    );
    final catsRes = await _categories.list();
    catsRes.fold(
      (c) => _categoryOptions = c,
      (_) => _categoryOptions = const [],
    );
    _loadingPickers = false;
    if (!_disposed) notifyListeners();

    // Background fetch recent history for autocomplete
    final historyRes = await _transactions.list(
      TransactionsListQuery(
        from: DateTime.now().subtract(const Duration(days: 90)),
        to: DateTime.now(),
        limit: 100,
      ),
    );
    if (historyRes case Success<List<Transaction>, AppError>(value: final ok)) {
      _transactionsHistory = ok;
      if (!_disposed) notifyListeners();
    }
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
    _disposed = true;
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
