import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class AccountFormState {
  const AccountFormState({
    this.groupId,
    this.name = '',
    this.balance,
    this.currencyCode,
    this.description = '',
  });

  final String? groupId;
  final String name;

  /// Null reads as zero. A [Decimal], never a double (D12).
  final Decimal? balance;

  /// Null is the workspace currency (WAL-5).
  final String? currencyCode;
  final String description;

  bool get isValid => name.trim().isNotEmpty && groupId != null;

  AccountFormState copyWith({
    String? groupId,
    String? name,
    Decimal? balance,
    String? currencyCode,
    String? description,
  }) {
    return AccountFormState(
      groupId: groupId ?? this.groupId,
      name: name ?? this.name,
      balance: balance ?? this.balance,
      currencyCode: currencyCode ?? this.currencyCode,
      description: description ?? this.description,
    );
  }
}

class AccountFormViewModel extends ChangeNotifier {
  AccountFormViewModel({
    required WalletsRepository wallets,
    required WalletGroupsRepository groups,
    Wallet? editing,
  }) : _wallets = wallets,
       _groups = groups,
       _editingId = editing?.id,
       _startBalance = editing?.balance ?? Decimal.zero {
    if (editing != null) _state = _stateFrom(editing);
    save = Command<NewWalletDraft, Wallet>(_runSave)
      ..addListener(notifyListeners);
    _loadGroups();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;
  // Set by the first successful create, so a retry after a failed adjust
  // updates that wallet instead of creating a second one.
  String? _editingId;

  /// The balance the form opened with; a save adjusts only when it moved.
  Decimal _startBalance;

  bool get isEditing => _editingId != null;

  AccountFormState _state = const AccountFormState();
  List<WalletGroup> _groupOptions = const [];
  bool _loadingGroups = true;

  late final Command<NewWalletDraft, Wallet> save;

  AccountFormState get state => _state;
  List<WalletGroup> get groupOptions => _groupOptions;
  bool get loadingGroups => _loadingGroups;
  bool get canSave => _state.isValid && !save.running;

  void setGroup(String id) {
    _state = _state.copyWith(groupId: id);
    notifyListeners();
  }

  void setName(String name) {
    _state = _state.copyWith(name: name);
    notifyListeners();
  }

  void setBalance(Decimal value) {
    _state = _state.copyWith(balance: value);
    notifyListeners();
  }

  void setCurrency(String code) {
    _state = _state.copyWith(currencyCode: code);
    notifyListeners();
  }

  void setDescription(String value) {
    _state = _state.copyWith(description: value);
    notifyListeners();
  }

  Future<Result<Wallet, AppError>?> submit() async {
    if (!_state.isValid) return null;
    final draft = NewWalletDraft(
      name: _state.name.trim(),
      groupId: _state.groupId,
      currencyCode: _state.currencyCode,
    );
    await save.run(draft);
    final ok = save.result;
    if (ok != null) return Success<Wallet, AppError>(ok);
    final err = save.error;
    if (err != null) return Failure<Wallet, AppError>(err);
    return null;
  }

  /// Creates or updates, then moves the balance to the typed figure through
  /// `/adjust` when it differs: a balance is never a column write (TXN-3).
  Future<Result<Wallet, AppError>> _runSave(NewWalletDraft draft) async {
    final id = _editingId;
    final saved = id == null
        ? await _wallets.create(draft)
        : await _wallets.update(id, draft);
    final target = _state.balance ?? Decimal.zero;
    if (saved case Success(:final value) when id == null) {
      _editingId = value.id;
      _startBalance = value.balance;
    }
    if (saved case Success(:final value) when target != _startBalance) {
      final adjusted = await _wallets.adjust(value.id, target);
      if (adjusted case Success()) _startBalance = target;
      return adjusted;
    }
    return saved;
  }

  static AccountFormState _stateFrom(Wallet w) => AccountFormState(
    groupId: w.groupId,
    name: w.name,
    balance: w.balance,
    currencyCode: w.currency,
  );

  Future<void> _loadGroups() async {
    final res = await _groups.list();
    res.fold((gs) => _groupOptions = gs, (_) => _groupOptions = const []);
    _loadingGroups = false;
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
