import 'package:decimal/decimal.dart';
import 'package:intl/intl.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Wire model for `TransactionView`, a row of `GET /v1/transactions` and the
/// answer to a create or update. Amounts are decimal strings and are parsed
/// straight into [Decimal], never through a double (D12, MOB-4).
class TransactionDto {
  const TransactionDto({
    required this.id,
    required this.type,
    required this.amount,
    required this.baseAmount,
    required this.walletCurrency,
    required this.date,
    required this.walletId,
    required this.walletName,
    this.toWalletId,
    this.toWalletName,
    this.categoryId,
    this.categoryName,
    this.name,
    this.description,
  });

  factory TransactionDto.fromJson(Map<String, dynamic> json) {
    return TransactionDto(
      id: json['id'] as String,
      type: json['type'] as String,
      amount: Decimal.parse(json['amount'] as String),
      baseAmount: Decimal.parse(json['base_amount'] as String),
      walletCurrency: json['wallet_currency_code'] as String,
      date: DateTime.parse(json['date'] as String),
      walletId: json['wallet_id'] as String,
      walletName: json['wallet_name'] as String? ?? '',
      toWalletId: json['to_wallet_id'] as String?,
      toWalletName: json['to_wallet_name'] as String?,
      categoryId: json['category_id'] as String?,
      categoryName: json['category_name'] as String?,
      name: json['name'] as String?,
      description: json['description'] as String?,
    );
  }

  final String id;
  final String type;
  final Decimal amount;
  final Decimal baseAmount;
  final String walletCurrency;

  /// An instant (RFC 3339).
  final DateTime date;
  final String walletId;
  final String walletName;
  final String? toWalletId;
  final String? toWalletName;
  final String? categoryId;
  final String? categoryName;
  final String? name;
  final String? description;

  Transaction toDomain() {
    final local = date.toLocal();
    return Transaction(
      id: id,
      type: TransactionType.fromWire(type),
      amount: Money(amount: amount, currency: walletCurrency),
      baseAmount: baseAmount,
      date: DateTime(local.year, local.month, local.day),
      walletId: walletId,
      toWalletId: toWalletId,
      categoryId: categoryId,
      name: name,
      description: description,
      wallet: NamedRef(id: walletId, name: walletName),
      toWallet: toWalletId == null
          ? null
          : NamedRef(id: toWalletId!, name: toWalletName ?? ''),
      category: categoryId == null
          ? null
          : NamedRef(id: categoryId!, name: categoryName ?? ''),
    );
  }

  /// The `POST` / `PATCH /v1/transactions` body (`TransactionBody`).
  ///
  /// The form picks a day, not an instant; it is sent as noon local time so
  /// the day survives the trip through UTC in any timezone.
  static Map<String, dynamic> body(NewTransactionDraft draft) {
    final d = draft.date;
    return {
      'type': draft.type.wire,
      'wallet_id': draft.walletId,
      'to_wallet_id': draft.toWalletId,
      'category_id': draft.categoryId,
      'amount': draft.amount.toString(),
      'date': DateTime(d.year, d.month, d.day, 12).toUtc().toIso8601String(),
      'name': draft.note,
      'description': draft.description,
      'attachment_ids': ?draft.attachmentIds,
    };
  }

  static final dayFormat = DateFormat('yyyy-MM-dd');
}
