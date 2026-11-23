import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// One slice of a category breakdown from `GET /v1/overview`.
@immutable
class CategoryShare {
  const CategoryShare({
    required this.total,
    this.id,
    this.name,
    this.other = false,
    this.sharePercent,
  });

  /// Null for uncategorized rows and for the "Other" bucket.
  final String? id;
  final String? name;

  /// The bucket past the top categories.
  final bool other;
  final Money total;

  /// The API's share of the period's total; null when that total is zero.
  final Decimal? sharePercent;

  String get label => name ?? (other ? 'Other' : 'Uncategorized');
}

/// The figures of `GET /v1/overview?from&to` the Stats tab reads (D27).
@immutable
class Overview {
  const Overview({
    required this.income,
    required this.expense,
    required this.incomeCategories,
    required this.expenseCategories,
  });

  final Money income;
  final Money expense;

  /// Top categories per type, then one "Other" bucket for the rest.
  final List<CategoryShare> incomeCategories;
  final List<CategoryShare> expenseCategories;
}
