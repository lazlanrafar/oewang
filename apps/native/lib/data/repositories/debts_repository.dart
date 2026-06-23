import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/debt.dart';

abstract class DebtsRepository {
  Future<Result<List<Debt>, AppError>> list({String? search});

  Future<Result<void, AppError>> create({
    required String contactId,
    required DebtType type,
    required num amount,
    String? description,
    DateTime? dueDate,
  });

  Future<Result<void, AppError>> update({
    required String id,
    num? amount,
    String? description,
    DateTime? dueDate,
  });

  Future<Result<void, AppError>> delete(String id);

  /// Records a payment. When [walletId] is given the API also creates the
  /// matching transaction (expense for payable, income for receivable).
  Future<Result<void, AppError>> pay({
    required String id,
    required num amount,
    String? walletId,
  });
}
