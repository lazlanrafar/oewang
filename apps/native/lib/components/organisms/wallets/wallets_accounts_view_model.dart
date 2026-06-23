import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
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

/// View-model for the Accounts tab (IMG_1835). Loads wallets + groups, then
/// computes Assets / Liabilities / Total + per-group sections.
class AccountsViewModel extends ChangeNotifier {
  AccountsViewModel({
    required WalletsRepository wallets,
    required WalletGroupsRepository groups,
  }) : _wallets = wallets,
       _groups = groups {
    load();
  }

  final WalletsRepository _wallets;
  final WalletGroupsRepository _groups;

  bool _loading = true;
  AppError? _error;
  List<AccountGroupSection> _sections = const [];
  Money _assets = Money.zero();
  Money _liabilities = Money.zero();

  bool get loading => _loading;
  AppError? get error => _error;
  List<AccountGroupSection> get sections => _sections;
  Money get assets => _assets;
  Money get liabilities => _liabilities;
  Money get total => Money(amount: _assets.amount - _liabilities.amount);

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    final groupsRes = await _groups.list();
    final walletsRes = await _wallets.list();

    final allWallets = walletsRes.fold((w) => w, (e) {
      _error = e;
      return <Wallet>[];
    });
    final allGroups = groupsRes.fold((g) => g, (e) {
      _error ??= e;
      return <WalletGroup>[];
    });

    final byGroup = <String?, List<Wallet>>{};
    for (final w in allWallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }

    var assets = Money.zero();
    var liabilities = Money.zero();
    final sections = <AccountGroupSection>[];
    for (final g in allGroups) {
      final ws = byGroup[g.id] ?? const <Wallet>[];
      // Skip groups with no accounts — they'd render as an empty header.
      if (ws.isEmpty) continue;
      var subtotal = Money.zero();
      for (final w in ws) {
        subtotal += Money(amount: w.balance, currency: w.currency);
        // Excluded wallets still show in the list but don't move the totals.
        if (!w.isIncludedInTotals) continue;
        if (w.balance >= 0) {
          assets += Money(amount: w.balance, currency: w.currency);
        } else {
          liabilities += Money(amount: -w.balance, currency: w.currency);
        }
      }
      sections.add(
        AccountGroupSection(group: g, wallets: ws, subtotal: subtotal),
      );
    }
    // Tail: wallets without a group.
    final ungrouped = byGroup[null] ?? const <Wallet>[];
    if (ungrouped.isNotEmpty) {
      var subtotal = Money.zero();
      for (final w in ungrouped) {
        subtotal += Money(amount: w.balance, currency: w.currency);
        // Excluded wallets still show in the list but don't move the totals.
        if (!w.isIncludedInTotals) continue;
        if (w.balance >= 0) {
          assets += Money(amount: w.balance, currency: w.currency);
        } else {
          liabilities += Money(amount: -w.balance, currency: w.currency);
        }
      }
      sections.add(
        AccountGroupSection(
          group: const WalletGroup(id: '', name: 'Others'),
          wallets: ungrouped,
          subtotal: subtotal,
        ),
      );
    }

    _sections = sections;
    _assets = assets;
    _liabilities = liabilities;
    _loading = false;
    notifyListeners();
  }

  /// Deletes a wallet then reloads. Returns the error message on failure.
  Future<String?> deleteWallet(String id) async {
    final err = (await _wallets.delete(id)).fold((_) => null, (e) => e.message);
    if (err == null) await load();
    return err;
  }

  /// Toggles whether a wallet counts toward the totals, then reloads.
  Future<String?> toggleIncluded(Wallet w) async {
    final err =
        (await _wallets.setIncludedInTotals(
          w.id,
          included: !w.isIncludedInTotals,
        )).fold((_) => null, (e) => e.message);
    if (err == null) await load();
    return err;
  }

  /// Persists a new order for the wallets in [groupId] (null = Others).
  Future<String?> reorderGroup(
    String? groupId,
    List<String> orderedIds,
  ) async {
    final err = (await _wallets.reorder(orderedIds, groupId: groupId))
        .fold((_) => null, (e) => e.message);
    if (err == null) await load();
    return err;
  }
}
