import 'dart:io';

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
    this.fees = 0,
    this.note = '',
    this.description = '',
    this.attachmentIds = const [],
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

  /// Vault file ids of uploaded receipt images, in add order — grown by
  /// [TransactionFormViewModel.addAttachment], shrunk by
  /// [TransactionFormViewModel.removeAttachment].
  final List<String> attachmentIds;

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
  }) : _transactions = transactions,
       _wallets = wallets,
       _categories = categories,
       _vault = vault,
       _editingId = editing?.id {
    if (editing != null) _state = _stateFrom(editing);
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
  bool _pickersLoadFailed = false;
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
  /// True when wallets/categories couldn't be loaded even after a retry —
  /// distinct from "this workspace genuinely has none", so the screen can
  /// offer a retry instead of rendering an empty picker.
  bool get pickersLoadFailed => _pickersLoadFailed;
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
      attachmentIds:
          _state.attachmentIds.isEmpty ? null : _state.attachmentIds,
    );
    await save.run(draft);
    final ok = save.result;
    if (ok != null) return Success<Transaction, AppError>(ok);
    final err = save.error;
    if (err != null) return Failure<Transaction, AppError>(err);
    return null;
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

  void resetForContinue() {
    save.reset();
    _state = TransactionFormState(
      type: _state.type,
      date: _state.date,
      walletId: _state.walletId,
      toWalletId: _state.toWalletId,
      categoryId: _state.categoryId,
      amount: 0,
      fees: 0,
      note: '',
      description: '',
    );
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

  bool _disposed = false;

  /// Loads wallets/categories, retrying once after a beat before giving up.
  /// A fetch right after registration can race the just-refreshed workspace
  /// id (the offline repos discard a stale-workspace result as a failure),
  /// so a single transient failure here must not be read as "0 wallets/
  /// categories exist" — that's indistinguishable from a genuine empty
  /// workspace and leaves the user with no way to tell something went wrong.
  Future<void> _loadPickers() async {
    var walletsRes = await _wallets.list();
    var catsRes = await _categories.list();
    if (walletsRes is Failure || catsRes is Failure) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      if (_disposed) return;
      walletsRes = await _wallets.list();
      catsRes = await _categories.list();
    }

    var failed = false;
    walletsRes.fold((w) => _walletOptions = w, (_) {
      _walletOptions = const [];
      failed = true;
    });
    catsRes.fold((c) => _categoryOptions = c, (_) {
      _categoryOptions = const [];
      failed = true;
    });

    _pickersLoadFailed = failed;
    _loadingPickers = false;
    if (!_disposed) notifyListeners();

    if (failed) return;

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

  /// Re-run the picker load after [pickersLoadFailed] — lets the screen offer
  /// a retry affordance instead of leaving the form stuck on an empty state.
  Future<void> retryLoadPickers() async {
    _loadingPickers = true;
    _pickersLoadFailed = false;
    notifyListeners();
    await _loadPickers();
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
