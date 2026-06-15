import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/wallet_group.dart';

abstract class WalletGroupsRepository {
  Future<Result<List<WalletGroup>, AppError>> list();
}
