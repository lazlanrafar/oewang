import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/domain/models/debt.dart';

class DebtsRepositoryFake implements DebtsRepository {
  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) async =>
      const Success([]);

  @override
  Future<Result<void, AppError>> create({
    required String contactId,
    required DebtType type,
    required num amount,
    String? description,
    DateTime? dueDate,
  }) async => const Success(null);

  @override
  Future<Result<void, AppError>> update({
    required String id,
    num? amount,
    String? description,
    DateTime? dueDate,
  }) async => const Success(null);

  @override
  Future<Result<void, AppError>> delete(String id) async => const Success(null);

  @override
  Future<Result<void, AppError>> pay({
    required String id,
    required num amount,
    String? walletId,
  }) async => const Success(null);
}
