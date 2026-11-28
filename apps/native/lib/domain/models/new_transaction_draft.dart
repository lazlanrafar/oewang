import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Form-side draft. Validated by the ViewModel; mapped to wire JSON by the
/// remote repository before POST/PATCH /v1/transactions.
@immutable
class NewTransactionDraft {
  const NewTransactionDraft({
    required this.type,
    required this.amount,
    required this.date,
    required this.walletId,
    this.toWalletId,
    this.categoryId,
    this.note,
    this.description,
    this.attachmentIds,
    this.source,
  });

  final TransactionType type;

  /// Sent as a decimal string, never a number (D12).
  final Decimal amount;

  /// The local calendar day.
  final DateTime date;
  final String walletId;
  final String? toWalletId;
  final String? categoryId;
  final String? note;
  final String? description;

  /// Vault file ids to attach. Null leaves an edited row's files alone.
  final List<String>? attachmentIds;

  /// `receipt` when the form was seeded from a scanned receipt, so the API
  /// tidies the names the reader wrote (D129). Null is a typed entry.
  final String? source;
}
