import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// Transaction kind as encoded by the API
/// (`income | expense | transfer | transfer-in | transfer-out`).
enum TransactionType {
  income,
  expense,
  transfer,
  transferIn,
  transferOut;

  static TransactionType fromWire(String raw) {
    switch (raw) {
      case 'income':
        return TransactionType.income;
      case 'expense':
        return TransactionType.expense;
      case 'transfer':
        return TransactionType.transfer;
      case 'transfer-in':
        return TransactionType.transferIn;
      case 'transfer-out':
        return TransactionType.transferOut;
      default:
        return TransactionType.expense;
    }
  }

  String get wire => switch (this) {
    TransactionType.income => 'income',
    TransactionType.expense => 'expense',
    TransactionType.transfer => 'transfer',
    TransactionType.transferIn => 'transfer-in',
    TransactionType.transferOut => 'transfer-out',
  };
}

/// Reference shape used inside [Transaction] for related entities.
@immutable
class NamedRef extends Equatable {
  const NamedRef({required this.id, required this.name});
  final String id;
  final String name;
  @override
  List<Object?> get props => [id, name];
}

@immutable
class Transaction extends Equatable {
  const Transaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.date,
    required this.walletId,
    this.toWalletId,
    this.categoryId,
    this.name,
    this.description,
    this.wallet,
    this.toWallet,
    this.category,
  });

  final String id;
  final TransactionType type;
  final Money amount;

  /// Calendar date the user assigned to the transaction (YYYY-MM-DD on the
  /// wire). Time-of-day is intentionally dropped.
  final DateTime date;

  final String walletId;
  final String? toWalletId;
  final String? categoryId;

  final String? name;
  final String? description;

  final NamedRef? wallet;
  final NamedRef? toWallet;
  final NamedRef? category;

  bool get isIncome => type == TransactionType.income;
  bool get isExpense => type == TransactionType.expense;

  @override
  List<Object?> get props => [
    id,
    type,
    amount,
    date,
    walletId,
    toWalletId,
    categoryId,
    name,
    description,
    wallet,
    toWallet,
    category,
  ];
}
