import 'package:decimal/decimal.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class Wallet extends Equatable {
  Wallet({
    required this.id,
    required this.name,
    this.groupId,
    Decimal? balance,
    this.currency = 'IDR',
    this.isIncludedInTotals = true,
  }) : balance = balance ?? Decimal.zero;

  final String id;
  final String name;
  final String? groupId;

  /// Live balance returned by the API (after transactions are applied).
  /// A [Decimal], never a double (D12).
  final Decimal balance;
  final String currency;

  /// Whether this wallet counts toward the Assets / Liabilities / Total.
  final bool isIncludedInTotals;

  @override
  List<Object?> get props => [
    id,
    name,
    groupId,
    balance,
    currency,
    isIncludedInTotals,
  ];
}
