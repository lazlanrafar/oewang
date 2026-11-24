import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/receipts_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/domain/models/receipt_draft.dart';

/// What a scan ended as, for the screen to act on.
sealed class ReceiptScanOutcome {
  const ReceiptScanOutcome();
}

/// Open the form prefilled. [readable] false means nothing usable came back
/// (`RECEIPT_UNREADABLE`, or a draft with neither total nor date): the form
/// opens with only the image attached (AI-3).
class ReceiptScanDraft extends ReceiptScanOutcome {
  const ReceiptScanDraft(this.draft, {required this.readable});
  final ReceiptDraft draft;
  final bool readable;
}

/// The reader did not answer; the image is in the vault and can be queued.
class ReceiptScanBusy extends ReceiptScanOutcome {
  const ReceiptScanBusy(this.vaultFileId);
  final String vaultFileId;
}

class ReceiptScanFailed extends ReceiptScanOutcome {
  const ReceiptScanFailed(this.error);
  final AppError error;
}

/// Upload, then read: the bytes go through the vault's chunked path and only
/// the id reaches the reader (D69). Nothing becomes a transaction until the
/// person saves the form (AI-2).
class ReceiptScanViewModel {
  ReceiptScanViewModel({
    required VaultRepository vault,
    required ReceiptsRepository receipts,
  }) : _vault = vault,
       _receipts = receipts;

  final VaultRepository _vault;
  final ReceiptsRepository _receipts;

  Future<ReceiptScanOutcome> scan(File image) async {
    final String id;
    switch (await _vault.upload(image)) {
      case Success(:final value):
        id = value.id;
      case Failure(:final error):
        return ReceiptScanFailed(error);
    }

    switch (await _receipts.parse(id)) {
      case Success(:final value):
        return ReceiptScanDraft(value, readable: !value.isEmpty);
      case Failure(:final error)
          when ReceiptsRepository.readerBusyCodes.contains(error.code) ||
              _timedOut(error):
        return ReceiptScanBusy(id);
      case Failure(:final error) when error.code == 'RECEIPT_UNREADABLE':
        return ReceiptScanDraft(ReceiptDraft(vaultFileId: id), readable: false);
      case Failure(:final error):
        return ReceiptScanFailed(error);
    }
  }

  /// The upload just went through, so a parse that ran out of time (the
  /// client's wait or the API's 408) is a reader that did not answer.
  static bool _timedOut(AppError e) =>
      e is NetworkError || (e is ServerError && e.statusCode == 408);

  Future<Result<void, AppError>> queue(String vaultFileId) =>
      _receipts.queue(vaultFileId);
}
