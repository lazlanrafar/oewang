import 'dart:io';
import 'dart:typed_data';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/vault_file.dart';

/// The workspace vault (`/v1/vault/files*`, D90). Bytes travel as base64
/// chunks inside OWE1, never through a signed URL (D23).
abstract class VaultRepository {
  /// Uploads [file] chunk by chunk and returns the stored, ready file.
  Future<Result<VaultFile, AppError>> upload(File file);

  /// One page of ready files; [hasMore] says whether a next page exists.
  Future<Result<({List<VaultFile> files, bool hasMore}), AppError>> list(
    VaultQuery query, {
    int page = 1,
  });

  /// `GET /v1/vault/files/{id}`: one live file's metadata, for a push that
  /// names it (PUSH-5). A deleted or unknown id is the API's `404`.
  Future<Result<VaultFile, AppError>> get(String id);

  /// A 320x320 JPEG preview (D91). `THUMBNAIL_UNAVAILABLE` for a PDF.
  Future<Result<Uint8List, AppError>> thumbnail(String id);

  /// The whole file, assembled from its chunks.
  Future<Result<Uint8List, AppError>> download(VaultFile file);

  Future<Result<VaultFile, AppError>> rename(String id, String name);

  /// Soft delete; detaches it from every transaction (VLT-11).
  Future<Result<void, AppError>> delete(String id);
}
