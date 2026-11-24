import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

class NewWalletDraft {
  const NewWalletDraft({required this.name, this.groupId, this.currencyCode});
  final String name;

  /// Null detaches the wallet from its group.
  final String? groupId;

  /// Null means the workspace currency on create (WAL-5) and "unchanged" on
  /// update.
  final String? currencyCode;
}

abstract class WalletsRepository {
  Future<Result<List<Wallet>, AppError>> list();

  /// `GET /v1/wallets/totals`: Assets, Liabilities, Total and the group
  /// subtotals, converted and summed by the API (D117).
  Future<Result<WalletTotals, AppError>> totals();
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft);
  Future<Result<Wallet, AppError>> update(String id, NewWalletDraft draft);
  Future<Result<void, AppError>> delete(String id);

  /// `POST /v1/wallets/{id}/adjust`: brings the balance to [balance] through
  /// one "Balance adjustment" transaction, never a column write (TXN-3).
  Future<Result<Wallet, AppError>> adjust(String id, Decimal balance);

  /// Toggles whether a wallet counts toward Assets / Liabilities / Total.
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  });
}
