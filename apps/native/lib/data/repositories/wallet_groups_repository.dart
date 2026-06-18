import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/wallet_group.dart';

abstract class WalletGroupsRepository {
  Future<Result<List<WalletGroup>, AppError>> list();
  Future<Result<WalletGroup, AppError>> create({required String name});
  Future<Result<WalletGroup, AppError>> update({
    required String id,
    required String name,
  });
  Future<Result<void, AppError>> delete(String id);
  Future<Result<void, AppError>> reorder(List<String> orderedIds);
}
