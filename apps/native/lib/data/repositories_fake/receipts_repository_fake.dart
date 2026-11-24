import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/receipts_repository.dart';
import 'package:oewang/domain/models/receipt_draft.dart';

/// Answers [next] for every parse; records what was queued.
class ReceiptsRepositoryFake implements ReceiptsRepository {
  ReceiptsRepositoryFake(this.next);

  Result<ReceiptDraft, AppError> Function(String vaultFileId) next;
  final queued = <String>[];

  @override
  Future<Result<ReceiptDraft, AppError>> parse(String vaultFileId) async =>
      next(vaultFileId);

  @override
  Future<Result<void, AppError>> queue(String vaultFileId) async {
    queued.add(vaultFileId);
    return const Success(null);
  }
}
