import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';

/// In memory, with the API's payment rules (DEBT-2 to DEBT-4, DEBT-7).
class DebtsRepositoryFake implements DebtsRepository {
  DebtsRepositoryFake({List<Debt>? seed, this.contactNames = const {}})
    : _debts = [...?seed];

  final List<Debt> _debts;
  final Map<String, List<DebtPayment>> _payments = {};
  final Map<String, String> contactNames;
  final List<NewDebtPayment> paid = [];
  int _seq = 0;

  static const _notFound = ServerError(
    statusCode: 404,
    message: 'Debt not found',
    code: 'DEBT_NOT_FOUND',
  );

  int _index(String id) => _debts.indexWhere((d) => d.id == id);

  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) async =>
      Success(List.unmodifiable(_debts));

  @override
  Future<Result<DebtSummary, AppError>> summary() async {
    var owed = Decimal.zero;
    var owe = Decimal.zero;
    for (final d in _debts) {
      if (d.type == DebtType.receivable) {
        owed += d.remainingAmount.amount;
      } else {
        owe += d.remainingAmount.amount;
      }
    }
    return Success(
      DebtSummary(
        owedToYou: Money(amount: owed),
        youOwe: Money(amount: owe),
        net: Money(amount: owed - owe),
        overdueCount: _debts.where((d) => d.isOverdue()).length,
      ),
    );
  }

  @override
  Future<Result<List<DebtPayment>, AppError>> payments(String debtId) async =>
      Success(List.unmodifiable(_payments[debtId] ?? const []));

  @override
  Future<Result<Debt, AppError>> create(NewDebtDraft draft) async {
    final money = Money(
      amount: draft.amount,
      currency: draft.currency ?? 'IDR',
    );
    final debt = Debt(
      id: 'debt-${++_seq}',
      contactId: draft.contactId,
      contactName: contactNames[draft.contactId] ?? '',
      type: draft.type,
      amount: money,
      remainingAmount: money,
      status: DebtStatus.unpaid,
      description: draft.description,
      dueDate: draft.dueDate,
    );
    _debts.add(debt);
    return Success(debt);
  }

  @override
  Future<Result<Debt, AppError>> update({
    required String id,
    String? contactId,
    Decimal? amount,
    String? description,
    DateTime? dueDate,
  }) async {
    final i = _index(id);
    if (i == -1) return const Failure(_notFound);
    final d = _debts[i];
    final paid = d.amount.amount - d.remainingAmount.amount;
    final next = amount ?? d.amount.amount;
    if (next < paid) {
      return const Failure(
        ServerError(
          statusCode: 422,
          message: 'Amount below what is paid',
          code: 'AMOUNT_BELOW_PAID',
        ),
      );
    }
    return Success(
      _debts[i] = _with(
        d,
        amount: next,
        remaining: next - paid,
        contactId: contactId,
        description: description,
        dueDate: dueDate,
      ),
    );
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    if ((_payments[id] ?? const []).isNotEmpty) {
      return const Failure(
        ServerError(
          statusCode: 409,
          message: 'Cancel its payments first',
          code: 'DEBT_HAS_PAYMENTS',
        ),
      );
    }
    _debts.removeWhere((d) => d.id == id);
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> pay(
    String debtId,
    NewDebtPayment payment,
  ) async {
    final i = _index(debtId);
    if (i == -1) return const Failure(_notFound);
    final d = _debts[i];
    if (payment.amount <= Decimal.zero ||
        payment.amount > d.remainingAmount.amount) {
      return const Failure(
        ServerError(
          statusCode: 422,
          message: 'Payment exceeds the remaining amount',
          code: 'PAYMENT_EXCEEDS_REMAINING',
        ),
      );
    }
    paid.add(payment);
    (_payments[debtId] ??= []).insert(
      0,
      DebtPayment(
        id: 'pay-${++_seq}',
        debtId: debtId,
        amount: Money(amount: payment.amount, currency: d.currency),
        date: payment.date,
        walletId: payment.walletId,
      ),
    );
    _debts[i] = _with(
      d,
      amount: d.amount.amount,
      remaining: d.remainingAmount.amount - payment.amount,
    );
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> cancelPayment(
    String debtId,
    String paymentId,
  ) async {
    final i = _index(debtId);
    final list = _payments[debtId] ?? [];
    final p = list.where((p) => p.id == paymentId).firstOrNull;
    if (i == -1 || p == null) return const Failure(_notFound);
    list.remove(p);
    final d = _debts[i];
    _debts[i] = _with(
      d,
      amount: d.amount.amount,
      remaining: d.remainingAmount.amount + p.amount.amount,
    );
    return const Success(null);
  }

  Debt _with(
    Debt d, {
    required Decimal amount,
    required Decimal remaining,
    String? contactId,
    String? description,
    DateTime? dueDate,
  }) => Debt(
    id: d.id,
    contactId: contactId ?? d.contactId,
    contactName: contactNames[contactId] ?? d.contactName,
    type: d.type,
    amount: Money(amount: amount, currency: d.currency),
    remainingAmount: Money(amount: remaining, currency: d.currency),
    status: DebtStatus.of(amount: amount, remaining: remaining),
    description: description ?? d.description,
    dueDate: dueDate ?? d.dueDate,
  );
}
