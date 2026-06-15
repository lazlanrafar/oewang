import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Form-side draft. Validated by the ViewModel; mapped to wire JSON by the
/// remote repository before POST /v1/transactions.
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
  });

  final TransactionType type;
  final num amount;
  final DateTime date;
  final String walletId;
  final String? toWalletId;
  final String? categoryId;
  final String? note;
  final String? description;
}
