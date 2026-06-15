import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

class TransactionsListQuery {
  const TransactionsListQuery({
    required this.from,
    required this.to,
    this.type,
    this.limit = 200,
  });

  final DateTime from;
  final DateTime to;
  final TransactionType? type;
  final int limit;
}

abstract class TransactionsRepository {
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  );

  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft);
}
