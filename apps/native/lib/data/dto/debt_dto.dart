import 'package:decimal/decimal.dart';
import 'package:oewang/domain/models/contact.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';

/// `/v1/debts*` and `/v1/contacts*` rows (docs/api/endpoints.md#debts).
/// Money arrives as decimal strings (D12) and stays [Decimal].
Debt debtFromJson(Map<String, dynamic> json) {
  final currency = json['currency_code'] as String? ?? 'IDR';
  final due = json['due_date'] as String?;
  return Debt(
    id: json['id'] as String,
    contactId: json['contact_id'] as String,
    contactName: json['contact_name'] as String? ?? '',
    type: DebtType.fromWire(json['type'] as String),
    amount: Money.parse(json['amount'] as String, currency: currency),
    remainingAmount: Money.parse(
      json['remaining_amount'] as String,
      currency: currency,
    ),
    status: DebtStatus.fromWire(json['status'] as String? ?? 'unpaid'),
    description: json['description'] as String?,
    dueDate: due == null ? null : DateTime.parse(due),
  );
}

DebtPayment debtPaymentFromJson(
  Map<String, dynamic> json, {
  required String currency,
}) => DebtPayment(
  id: json['id'] as String,
  debtId: json['debt_id'] as String,
  amount: Money.parse(json['amount'] as String, currency: currency),
  date: DateTime.parse(json['date'] as String),
  walletId: json['wallet_id'] as String?,
  walletName: json['wallet_name'] as String?,
);

DebtSummary debtSummaryFromJson(Map<String, dynamic> json) {
  final currency = json['currency_code'] as String? ?? 'IDR';
  Money money(String key) =>
      Money.parse(json[key] as String? ?? '0', currency: currency);
  return DebtSummary(
    owedToYou: money('owed_to_you'),
    youOwe: money('you_owe'),
    net: money('net'),
    overdueCount: (json['overdue_count'] as num?)?.toInt() ?? 0,
  );
}

Contact contactFromJson(Map<String, dynamic> json) => Contact(
  id: json['id'] as String,
  name: json['name'] as String,
  email: json['email'] as String?,
  phone: json['phone'] as String?,
  note: json['note'] as String?,
);

/// `YYYY-MM-DD`, the wire form of a day (`due_date`, `today`).
String dayWire(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// A day sent as noon local time, as transaction dates are, so the day
/// survives any timezone.
String dateWire(DateTime d) =>
    DateTime(d.year, d.month, d.day, 12).toUtc().toIso8601String();

Map<String, dynamic> debtBody(NewDebtDraft d) => {
  'type': d.type.wire,
  'contact_id': d.contactId,
  'amount': '${d.amount}',
  if (d.currency != null) 'currency_code': d.currency,
  if (d.description != null && d.description!.isNotEmpty)
    'description': d.description,
  if (d.dueDate != null) 'due_date': dayWire(d.dueDate!),
};

Map<String, dynamic> paymentBody(NewDebtPayment p) => {
  'amount': '${p.amount}',
  'date': dateWire(p.date),
  if (p.walletId != null) 'wallet_id': p.walletId,
  if (p.exchangeRate != null) 'exchange_rate': '${p.exchangeRate}',
};

Map<String, dynamic> contactBody({
  required String name,
  String? email,
  String? phone,
  String? note,
}) => {
  'name': name.trim(),
  'email': _blankToNull(email),
  'phone': _blankToNull(phone),
  'note': _blankToNull(note),
};

String? _blankToNull(String? s) =>
    s == null || s.trim().isEmpty ? null : s.trim();
