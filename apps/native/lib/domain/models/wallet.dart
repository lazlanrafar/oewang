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
  });

  final String id;
  final String name;
  final String? groupId;

  /// Live balance returned by the API (after transactions are applied).
  final num balance;
  final String currency;

  @override
  List<Object?> get props => [id, name, groupId, balance, currency];
}
