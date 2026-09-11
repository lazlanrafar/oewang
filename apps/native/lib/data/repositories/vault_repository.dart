import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/vault_file.dart';

abstract class VaultRepository {
  /// Uploads [file] to the workspace vault and returns the stored
  /// [VaultFile] (its `id` is what a transaction's `attachmentIds` reference).
  Future<Result<VaultFile, AppError>> upload(File file);

  /// A temporary signed URL for viewing/downloading the vault file [id].
  Future<Result<String, AppError>> getDownloadUrl(String id);
}
