import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/wallet.dart';

class NewWalletDraft {
  const NewWalletDraft({
    required this.name,
    required this.balance,
    this.groupId,
  });
  final String name;
  final num balance;
  final String? groupId;
}

abstract class WalletsRepository {
  Future<Result<List<Wallet>, AppError>> list();
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft);
  Future<Result<Wallet, AppError>> update(String id, NewWalletDraft draft);
  Future<Result<void, AppError>> delete(String id);

  /// Reorders wallets within [groupId] (null = ungrouped). [orderedIds] is the
  /// new top-to-bottom order for that group.
  Future<Result<void, AppError>> reorder(
    List<String> orderedIds, {
    String? groupId,
  });

  /// Toggles whether a wallet counts toward Assets / Liabilities / Total.
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  });
}
