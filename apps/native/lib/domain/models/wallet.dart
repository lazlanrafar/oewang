import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class Wallet extends Equatable {
  const Wallet({
    required this.id,
    required this.name,
    this.groupId,
    this.balance = 0,
    this.currency = 'IDR',
    this.isIncludedInTotals = true,
  });

  final String id;
  final String name;
  final String? groupId;

  /// Live balance returned by the API (after transactions are applied).
  final num balance;
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
