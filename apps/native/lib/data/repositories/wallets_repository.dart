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
}
