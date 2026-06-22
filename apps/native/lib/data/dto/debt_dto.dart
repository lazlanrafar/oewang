import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';

class DebtDto {
  const DebtDto({
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

  factory DebtDto.fromJson(Map<String, dynamic> json) => DebtDto(
    id: json['id'] as String,
    contactId: (json['contactId'] ?? json['contact_id']) as String,
    contactName: (json['contactName'] ?? json['contact_name']) as String? ?? '',
    type: (json['type'] as String?) ?? 'receivable',
    amount: _readNum(json['amount']),
    remainingAmount: _readNum(
      json['remainingAmount'] ?? json['remaining_amount'],
    ),
    status: (json['status'] as String?) ?? 'unpaid',
    description: json['description'] as String?,
    dueDate: _readDate(json['dueDate'] ?? json['due_date']),
  );

  final String id;
  final String contactId;
  final String contactName;
  final String type;
  final num amount;
  final num remainingAmount;
  final String status;
  final String? description;
  final DateTime? dueDate;

  Debt toDomain() => Debt(
    id: id,
    contactId: contactId,
    contactName: contactName,
    type: DebtType.fromWire(type),
    amount: Money(amount: amount),
    remainingAmount: Money(amount: remainingAmount),
    status: DebtStatus.fromWire(status),
    description: description,
    dueDate: dueDate,
  );

  static num _readNum(Object? v) {
    if (v is num) return v;
    if (v is String) return num.tryParse(v) ?? 0;
    return 0;
  }

  static DateTime? _readDate(Object? v) {
    if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
    return null;
  }
}
