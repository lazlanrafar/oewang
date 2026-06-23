import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

// ponytail: the workspace base/main currency is IDR app-wide (the rates API
// uses IDR as its base and there's no workspace main-currency endpoint yet).
// Currency is display-only on this form because the wallet API has no currency
// field; the selectable options come from the global subCurrenciesProvider,
// resolved in the screen.
const mainCurrencyCode = 'IDR';

class AccountFormState {
  const AccountFormState({
    this.groupId,
    this.name = '',
    this.balance = 0,
    this.currencyCode = mainCurrencyCode,
    this.description = '',
  });

  final String? groupId;
  final String name;
  final num balance;
  final String currencyCode;
  final String description;

  bool get isValid => name.trim().isNotEmpty && groupId != null;

  AccountFormState copyWith({
    String? groupId,
    String? name,
    num? balance,
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
       _editingId = editing?.id {
    if (editing != null) _state = _stateFrom(editing);
    save = Command<NewWalletDraft, Wallet>(_runSave)
      ..addListener(notifyListeners);
    _loadGroups();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;
  final String? _editingId;

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

  void setBalance(num value) {
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
      balance: _state.balance,
      groupId: _state.groupId,
    );
    await save.run(draft);
    final ok = save.result;
    if (ok != null) return Success<Wallet, AppError>(ok);
    final err = save.error;
    if (err != null) return Failure<Wallet, AppError>(err);
    return null;
  }

  /// Dispatches the Save command to create (new) or update (editing).
  Future<Result<Wallet, AppError>> _runSave(NewWalletDraft draft) {
    final id = _editingId;
    return id == null
        ? _wallets.create(draft)
        : _wallets.update(id, draft);
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
