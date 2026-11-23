import 'package:decimal/decimal.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// Transaction kind as encoded by the API (`income | expense | transfer`).
/// `transfer-in` / `transfer-out` are the old API's and only read.
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

/// A vault file attached to a transaction (e.g. a receipt photo). `id` is
/// the vault file id — the same value a transaction's `attachmentIds` sends.
@immutable
class TransactionAttachment extends Equatable {
  const TransactionAttachment({required this.id, this.name, this.type});
  final String id;
  final String? name;
  final String? type;
  @override
  List<Object?> get props => [id, name, type];
}

@immutable
class Transaction extends Equatable {
  Transaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.date,
    required this.walletId,
    Decimal? baseAmount,
    this.toWalletId,
    this.categoryId,
    this.name,
    this.description,
    this.wallet,
    this.toWallet,
    this.category,
    this.attachments = const [],
  }) : baseAmount = baseAmount ?? amount.amount;

  final String id;
  final TransactionType type;

  /// In the wallet's own currency, as entered against the wallet.
  final Money amount;

  /// The same movement in the workspace's currency, computed by the API at
  /// write time (D39). Sums across wallets add this, never [amount], which
  /// may be in different currencies.
  final Decimal baseAmount;

  /// Local calendar day of the transaction. Time-of-day is dropped.
  final DateTime date;

  final String walletId;
  final String? toWalletId;
  final String? categoryId;

  final String? name;
  final String? description;

  final NamedRef? wallet;
  final NamedRef? toWallet;
  final NamedRef? category;
  final List<TransactionAttachment> attachments;

  bool get isIncome => type == TransactionType.income;
  bool get isExpense => type == TransactionType.expense;

  @override
  List<Object?> get props => [
    id,
    type,
    amount,
    baseAmount,
    date,
    walletId,
    toWalletId,
    categoryId,
    name,
    description,
    wallet,
    toWallet,
    category,
    attachments,
  ];
}

/// Totals for a date range from `GET /v1/transactions/summary`, in the
/// workspace's currency. Computed by the API (D27), never summed here.
@immutable
class TransactionsSummary extends Equatable {
  const TransactionsSummary({
    required this.currency,
    required this.income,
    required this.expense,
  });

  factory TransactionsSummary.zero(String currency) => TransactionsSummary(
    currency: currency,
    income: Money.zero(currency: currency),
    expense: Money.zero(currency: currency),
  );

  final String currency;
  final Money income;
  final Money expense;

  Money get net => income - expense;

  @override
  List<Object?> get props => [currency, income, expense];
}
