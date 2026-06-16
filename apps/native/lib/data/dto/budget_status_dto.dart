import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

class BudgetStatusDto {
  const BudgetStatusDto({
    required this.id,
    required this.categoryId,
    required this.categoryName,
    required this.amount,
    required this.spent,
    required this.percentage,
  });

  factory BudgetStatusDto.fromJson(Map<String, dynamic> json) {
    return BudgetStatusDto(
      id: json['id'] as String,
      categoryId: (json['categoryId'] ?? json['category_id']) as String,
      categoryName:
          (json['categoryName'] ?? json['category_name']) as String? ?? '',
      amount: _readNum(json['amount']),
      spent: _readNum(json['spent']),
      percentage: _readInt(json['percentage']),
    );
  }

  final String id;
  final String categoryId;
  final String categoryName;
  final num amount;
  final num spent;
  final int percentage;

  BudgetStatus toDomain() => BudgetStatus(
    id: id,
    categoryId: categoryId,
    categoryName: categoryName,
    amount: Money(amount: amount),
    spent: Money(amount: spent),
    percentage: percentage,
  );

  static num _readNum(Object? v) {
    if (v is num) return v;
    if (v is String) return num.tryParse(v) ?? 0;
    return 0;
  }

  static int _readInt(Object? v) {
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}
