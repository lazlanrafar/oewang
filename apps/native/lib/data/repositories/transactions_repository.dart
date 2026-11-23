import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

class TransactionsListQuery {
  const TransactionsListQuery({
    required this.from,
    required this.to,
    this.type,
    this.limit = 100,
    this.page = 1,
  });

  /// Inclusive local days.
  final DateTime from;
  final DateTime to;
  final TransactionType? type;

  /// The API caps it at 100.
  final int limit;
  final int page;
}

abstract class TransactionsRepository {
  /// One page of `GET /v1/transactions`, newest first.
  Future<Result<List<Transaction>, AppError>> list(TransactionsListQuery query);

  /// `GET /v1/transactions/summary` for the inclusive days [from] to [to].
  Future<Result<TransactionsSummary, AppError>> summary({
    required DateTime from,
    required DateTime to,
  });

  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft);

  Future<Result<Transaction, AppError>> update(
    String id,
    NewTransactionDraft draft,
  );

  Future<Result<void, AppError>> delete(String id);
}
