import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Wire model for a single transaction row from `GET /v1/transactions`.
class TransactionDto {
  const TransactionDto({
    required this.id,
    required this.type,
    required this.amount,
    required this.currency,
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

  factory TransactionDto.fromJson(Map<String, dynamic> json) {
    return TransactionDto(
      id: json['id'] as String,
      type: json['type'] as String,
      amount: _readNum(json['amount']),
      currency: json['currency'] as String? ?? 'IDR',
      date: DateTime.parse(json['date'] as String),
      walletId: (json['walletId'] ?? json['wallet_id']) as String,
      toWalletId: (json['toWalletId'] ?? json['to_wallet_id']) as String?,
      categoryId: (json['categoryId'] ?? json['category_id']) as String?,
      name: json['name'] as String?,
      description: json['description'] as String?,
      wallet: _readRef(json['wallet']),
      toWallet: _readRef(json['toWallet']),
      category: _readRef(json['category']),
    );
  }

  final String id;
  final String type;
  final num amount;
  final String currency;
  final DateTime date;
  final String walletId;
  final String? toWalletId;
  final String? categoryId;
  final String? name;
  final String? description;
  final NamedRef? wallet;
  final NamedRef? toWallet;
  final NamedRef? category;

  Transaction toDomain() {
    return Transaction(
      id: id,
      type: TransactionType.fromWire(type),
      amount: Money(amount: amount, currency: currency),
      date: DateTime(date.year, date.month, date.day),
      walletId: walletId,
      toWalletId: toWalletId,
      categoryId: categoryId,
      name: name,
      description: description,
      wallet: wallet,
      toWallet: toWallet,
      category: category,
    );
  }

  static num _readNum(Object? v) {
    if (v is num) return v;
    if (v is String) return num.tryParse(v) ?? 0;
    return 0;
  }

  static NamedRef? _readRef(Object? v) {
    if (v is! Map) return null;
    final id = v['id'];
    final name = v['name'];
    if (id is! String || name is! String) return null;
    return NamedRef(id: id, name: name);
  }
}
