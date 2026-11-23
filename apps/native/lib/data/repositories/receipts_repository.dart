import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/receipt_draft.dart';

/// Receipt reading (AI-1). The image is in the vault first; only its id
/// travels here (D69).
abstract class ReceiptsRepository {
  /// The reader did not answer: worth queuing rather than giving up (D95).
  static const readerBusyCodes = {'AI_UNAVAILABLE', 'EXTRACTION_NO_ANSWER'};

  /// `POST /v1/ai/receipt/parse`. Persists nothing (AI-2).
  Future<Result<ReceiptDraft, AppError>> parse(String vaultFileId);

  /// `POST /v1/receipts/pending`: read it later. Queuing twice is one job.
  Future<Result<void, AppError>> queue(String vaultFileId);
}
