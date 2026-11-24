import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/debt.dart';

/// `/v1/debts*` (DEBT-16, MOB-10).
abstract class DebtsRepository {
  Future<Result<List<Debt>, AppError>> list({String? search});

  /// The cards: owed to you, you owe, net and overdue, from the API (D27).
  Future<Result<DebtSummary, AppError>> summary();

  /// The live payments of one debt, newest first.
  Future<Result<List<DebtPayment>, AppError>> payments(String debtId);

  Future<Result<Debt, AppError>> create(NewDebtDraft draft);

  /// Contact, amount, description and due date (DEBT-2). An amount below
  /// what is paid is refused by the API (`AMOUNT_BELOW_PAID`).
  Future<Result<Debt, AppError>> update({
    required String id,
    String? contactId,
    Decimal? amount,
    String? description,
    DateTime? dueDate,
  });

  /// Refused with `DEBT_HAS_PAYMENTS` while a live payment exists (DEBT-3).
  Future<Result<void, AppError>> delete(String id);

  /// With a wallet the API also writes the transaction (DEBT-4).
  Future<Result<void, AppError>> pay(String debtId, NewDebtPayment payment);

  /// Cancels a payment and its transaction (DEBT-7).
  Future<Result<void, AppError>> cancelPayment(String debtId, String paymentId);
}
