import 'package:decimal/decimal.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// `payable` = you owe the contact; `receivable` = the contact owes you.
enum DebtType {
  payable,
  receivable;

  static DebtType fromWire(String raw) =>
      raw == 'payable' ? DebtType.payable : DebtType.receivable;

  String get wire => name;
}

/// Derived from the remaining amount by the API (DEBT-2); never sent.
enum DebtStatus {
  unpaid,
  partial,
  paid;

  static DebtStatus fromWire(String raw) => switch (raw) {
    'paid' => DebtStatus.paid,
    'partial' => DebtStatus.partial,
    _ => DebtStatus.unpaid,
  };

  /// The API's rule, for a row changed while offline.
  static DebtStatus of({required Decimal amount, required Decimal remaining}) =>
      remaining == Decimal.zero
      ? DebtStatus.paid
      : remaining == amount
      ? DebtStatus.unpaid
      : DebtStatus.partial;
}

@immutable
class Debt extends Equatable {
  const Debt({
    required this.id,
    required this.contactId,
    required this.contactName,
    required this.type,
    required this.amount,
    required this.remainingAmount,
    required this.status,
    this.description,
    this.dueDate,
  });

  final String id;
  final String contactId;
  final String contactName;
  final DebtType type;

  /// In the debt's own currency (D120).
  final Money amount;

  /// Still owed; decreases as payments are recorded.
  final Money remainingAmount;
  final DebtStatus status;
  final String? description;

  /// A calendar day, not an instant.
  final DateTime? dueDate;

  String get currency => amount.currency;
  bool get isPaid => status == DebtStatus.paid;
  bool get isPartial => status == DebtStatus.partial;

  /// Past the due date and not settled, against the person's local [today].
  bool isOverdue([DateTime? today]) {
    final due = dueDate;
    if (due == null || isPaid) return false;
    final t = today ?? DateTime.now();
    return due.isBefore(DateTime(t.year, t.month, t.day));
  }

  @override
  List<Object?> get props => [
    id,
    contactId,
    contactName,
    type,
    amount,
    remainingAmount,
    status,
    description,
    dueDate,
  ];
}

/// One payment on a debt. [walletId] is null when it moved no wallet.
@immutable
class DebtPayment extends Equatable {
  const DebtPayment({
    required this.id,
    required this.debtId,
    required this.amount,
    required this.date,
    this.walletId,
    this.walletName,
  });

  final String id;
  final String debtId;

  /// In the debt's currency.
  final Money amount;
  final DateTime date;
  final String? walletId;
  final String? walletName;

  @override
  List<Object?> get props => [id, debtId, amount, date, walletId, walletName];
}

/// The cards on the debts tab, computed by the API in the workspace
/// currency (DEBT-11, D27).
@immutable
class DebtSummary extends Equatable {
  const DebtSummary({
    required this.owedToYou,
    required this.youOwe,
    required this.net,
    required this.overdueCount,
    this.leftOut = 0,
  });

  final Money owedToYou;
  final Money youOwe;
  final Money net;
  final int overdueCount;

  /// Debts in a currency with no rate to the workspace's, left out of the
  /// three figures (as the wallet totals do, D117).
  final int leftOut;

  @override
  List<Object?> get props => [owedToYou, youOwe, net, overdueCount, leftOut];
}

/// A new debt from the form.
@immutable
class NewDebtDraft {
  const NewDebtDraft({
    required this.contactId,
    required this.type,
    required this.amount,
    this.currency,
    this.description,
    this.dueDate,
  });

  final String contactId;
  final DebtType type;
  final Decimal amount;

  /// Null means the workspace currency.
  final String? currency;
  final String? description;
  final DateTime? dueDate;
}

/// A payment from the pay screen. [exchangeRate] is set only when the
/// wallet's currency differs from the debt's (DEBT-5).
@immutable
class NewDebtPayment {
  const NewDebtPayment({
    required this.amount,
    required this.date,
    this.walletId,
    this.exchangeRate,
  });

  final Decimal amount;
  final DateTime date;
  final String? walletId;
  final Decimal? exchangeRate;
}
