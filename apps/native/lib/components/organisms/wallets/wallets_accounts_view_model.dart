import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

@immutable
class AccountGroupSection {
  const AccountGroupSection({
    required this.group,
    required this.wallets,
    required this.subtotal,
  });
  final WalletGroup group;
  final List<Wallet> wallets;
  final Money subtotal;
}

/// View-model for the Accounts tab (IMG_1835). Loads wallets, groups and the
/// workspace currency, then sums Assets / Liabilities / Total per section.
///
/// The sums add balances the API sent as decimals, in the workspace currency
/// only: a foreign wallet shows its own balance and stays out of every total,
/// because adding two currencies is wrong and converting is the API's job.
// shortcut: the API has no wallet-totals figure, so foreign wallets are left
// out rather than converted; a `/v1/wallets` total would replace these sums.
class AccountsViewModel extends ChangeNotifier {
  AccountsViewModel({
    required WalletsRepository wallets,
    required WalletGroupsRepository groups,
    required WorkspacesRepository workspaces,
    Future<String?> Function()? lastCurrency,
  }) : _wallets = wallets,
       _groups = groups,
       _workspaces = workspaces,
       _lastCurrency = lastCurrency ?? (() async => null) {
    ready = load();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;
  final WorkspacesRepository _workspaces;

  /// The workspace currency last seen online, so the tab still adds up
  /// offline (MOB-6) instead of failing on the workspace fetch.
  final Future<String?> Function() _lastCurrency;

  /// Resolves once the initial [load] completes — await in tests instead of
  /// guessing a delay.
  late final Future<void> ready;

  bool _loading = true;
  AppError? _error;
  List<AccountGroupSection> _sections = const [];
  String _currency = '';
  Money _assets = Money.zero();
  Money _liabilities = Money.zero();

  bool get loading => _loading;
  AppError? get error => _error;
  List<AccountGroupSection> get sections => _sections;
  Money get assets => _assets;
  Money get liabilities => _liabilities;
  Money get total => _assets - _liabilities;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    final (groupsRes, walletsRes, workspaceRes) = await (
      _groups.list(),
      _wallets.list(),
      _workspaces.current(),
    ).wait;

    final allWallets = walletsRes.fold((w) => w, (e) {
      _error = e;
      return <Wallet>[];
    });
    final allGroups = groupsRes.fold((g) => g, (e) {
      _error ??= e;
      return <WalletGroup>[];
    });
    switch (workspaceRes) {
      case Success(:final value):
        _currency = value.currencyCode;
      case Failure(:final error):
        final last = await _lastCurrency();
        if (last == null) _error ??= error;
        _currency = last ?? '';
    }

    final byGroup = <String?, List<Wallet>>{};
    for (final w in allWallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }

    _assets = Money.zero(currency: _currency);
    _liabilities = Money.zero(currency: _currency);
    final sections = <AccountGroupSection>[
      for (final g in allGroups)
        // Skip groups with no accounts — they'd render as an empty header.
        if (byGroup[g.id]?.isNotEmpty ?? false) _section(g, byGroup[g.id]!),
      // Tail: wallets without a group.
      if (byGroup[null]?.isNotEmpty ?? false)
        _section(const WalletGroup(id: '', name: 'Others'), byGroup[null]!),
    ];

    _sections = sections;
    _loading = false;
    notifyListeners();
  }

  /// One group's subtotal; adds the counted wallets to the totals.
  AccountGroupSection _section(WalletGroup g, List<Wallet> ws) {
    var subtotal = Money.zero(currency: _currency);
    for (final w in ws) {
      if (w.currency != _currency) continue;
      final m = Money(amount: w.balance, currency: w.currency);
      subtotal += m;
      // Excluded wallets still show in the list but don't move the totals.
      if (!w.isIncludedInTotals) continue;
      if (w.balance >= Decimal.zero) {
        _assets += m;
      } else {
        _liabilities += m.negate();
      }
    }
    return AccountGroupSection(group: g, wallets: ws, subtotal: subtotal);
  }

  /// Deletes a wallet then reloads. Returns the error message on failure.
  Future<String?> deleteWallet(String id) async {
    final err = (await _wallets.delete(id)).fold((_) => null, (e) => e.message);
    if (err == null) await load();
    return err;
  }
}
