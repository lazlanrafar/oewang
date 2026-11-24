import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

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

/// View-model for the Accounts tab (IMG_1835). Loads wallets, groups and
/// `GET /v1/wallets/totals`; every figure above and between the rows is the
/// API's (MOB-4, D27, D117). A foreign wallet still shows its own balance
/// in its row.
class AccountsViewModel extends ChangeNotifier {
  AccountsViewModel({
    required WalletsRepository wallets,
    required WalletGroupsRepository groups,
  }) : _wallets = wallets,
       _groups = groups {
    ready = load();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;

  /// Resolves once the initial [load] completes — await in tests instead of
  /// guessing a delay.
  late final Future<void> ready;

  bool _loading = true;
  AppError? _error;
  List<AccountGroupSection> _sections = const [];
  WalletTotals? _totals;

  bool get loading => _loading;
  AppError? get error => _error;
  List<AccountGroupSection> get sections => _sections;
  Money get assets => _totals?.assets ?? Money.zero();
  Money get liabilities => _totals?.liabilities ?? Money.zero();
  Money get total => _totals?.total ?? Money.zero();

  /// Counted wallets with no rate today, so the total is partial.
  int get leftOut => _totals?.leftOut ?? 0;
  bool get isEstimate => _totals?.isEstimate ?? false;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    final (groupsRes, walletsRes, totalsRes) = await (
      _groups.list(),
      _wallets.list(),
      _wallets.totals(),
    ).wait;

    final allWallets = walletsRes.fold((w) => w, (e) {
      _error = e;
      return <Wallet>[];
    });
    final allGroups = groupsRes.fold((g) => g, (e) {
      _error ??= e;
      return <WalletGroup>[];
    });
    _totals = totalsRes.fold((t) => t, (e) {
      _error ??= e;
      return null;
    });

    final byGroup = <String?, List<Wallet>>{};
    for (final w in allWallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }

    AccountGroupSection section(WalletGroup g, String? id) =>
        AccountGroupSection(
          group: g,
          wallets: byGroup[id]!,
          subtotal:
              _totals?.group(id)?.subtotal ??
              Money.zero(currency: total.currency),
        );

    _sections = [
      for (final g in allGroups)
        // Skip groups with no accounts — they'd render as an empty header.
        if (byGroup[g.id]?.isNotEmpty ?? false) section(g, g.id),
      // Tail: wallets without a group.
      if (byGroup[null]?.isNotEmpty ?? false)
        section(const WalletGroup(id: '', name: 'Others'), null),
    ];
    _loading = false;
    notifyListeners();
  }

  /// Deletes a wallet then reloads. Returns the error message on failure.
  Future<String?> deleteWallet(String id) async {
    final err = (await _wallets.delete(id)).fold((_) => null, (e) => e.message);
    if (err == null) await load();
    return err;
  }
}
