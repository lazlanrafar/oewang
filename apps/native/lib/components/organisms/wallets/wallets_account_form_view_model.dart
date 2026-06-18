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
    this.balance = 0,
    this.description = '',
  });

  final String? groupId;
  final String name;
  final num balance;
  final String description;

  bool get isValid => name.trim().isNotEmpty && groupId != null;

  AccountFormState copyWith({
    String? groupId,
    String? name,
    num? balance,
    String? description,
  }) {
    return AccountFormState(
      groupId: groupId ?? this.groupId,
      name: name ?? this.name,
      balance: balance ?? this.balance,
      description: description ?? this.description,
    );
  }
}

class AccountFormViewModel extends ChangeNotifier {
  AccountFormViewModel({
    required WalletsRepository wallets,
    required WalletGroupsRepository groups,
  }) : _wallets = wallets,
       _groups = groups {
    save = Command<NewWalletDraft, Wallet>(_wallets.create)
      ..addListener(notifyListeners);
    _loadGroups();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;

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
