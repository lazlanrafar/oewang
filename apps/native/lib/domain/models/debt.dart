import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// `payable` = you owe the contact; `receivable` = the contact owes you.
enum DebtType {
  payable,
  receivable;

  static DebtType fromWire(String raw) =>
      raw == 'payable' ? DebtType.payable : DebtType.receivable;

  String get wire => this == DebtType.payable ? 'payable' : 'receivable';
}

/// Server-derived state based on the remaining amount.
enum DebtStatus {
  unpaid,
  partial,
  paid;

  static DebtStatus fromWire(String raw) => switch (raw) {
    'paid' => DebtStatus.paid,
    'partial' => DebtStatus.partial,
    _ => DebtStatus.unpaid,
  };
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

  /// Original amount, never changes after creation.
  final Money amount;

  /// Still owed; decreases as payments are recorded.
  final Money remainingAmount;
  final DebtStatus status;
  final String? description;
  final DateTime? dueDate;

  Money get paid => amount - remainingAmount;
  bool get isPaid => status == DebtStatus.paid;
  bool get isPartial => status == DebtStatus.partial;

  /// Past the due date and not yet settled. [now] defaults to today.
  bool isOverdue([DateTime? now]) {
    final due = dueDate;
    if (due == null || isPaid) return false;
    return due.isBefore(now ?? DateTime.now());
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

/// Workspace-wide debt position used by the summary header.
@immutable
class DebtTotals extends Equatable {
  const DebtTotals({required this.owedToYou, required this.youOwe});

  factory DebtTotals.fromDebts(List<Debt> debts) {
    var owed = Money.zero();
    var owe = Money.zero();
    for (final d in debts) {
      if (d.type == DebtType.receivable) {
        owed += d.remainingAmount;
      } else {
        owe += d.remainingAmount;
      }
    }
    return DebtTotals(owedToYou: owed, youOwe: owe);
  }

  /// Receivable remaining (the contacts owe you this in total).
  final Money owedToYou;

  /// Payable remaining (you owe this in total).
  final Money youOwe;

  Money get net => owedToYou - youOwe;

  @override
  List<Object?> get props => [owedToYou, youOwe];
}
