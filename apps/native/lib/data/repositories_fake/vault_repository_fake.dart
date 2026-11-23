import 'dart:io';
import 'dart:typed_data';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/domain/models/vault_file.dart';

class VaultRepositoryFake implements VaultRepository {
  VaultRepositoryFake([List<VaultFile>? files]) : files = files ?? [];

  final List<VaultFile> files;
  int _counter = 0;

  @override
  Future<Result<VaultFile, AppError>> upload(File file) async {
    _counter++;
    final stored = VaultFile(
      id: 'fake-vault-file-$_counter',
      name: file.uri.pathSegments.last,
      type: 'image/jpeg',
      size: 1,
    );
    files.insert(0, stored);
    return Success(stored);
  }

  @override
  Future<Result<({List<VaultFile> files, bool hasMore}), AppError>> list(
    VaultQuery query, {
    int page = 1,
  }) async => Success((
    files: files
        .where(
          (f) =>
              (f.name ?? '').toLowerCase().contains(query.search.toLowerCase()),
        )
        .toList(),
    hasMore: false,
  ));

  @override
  Future<Result<Uint8List, AppError>> thumbnail(String id) async =>
      const Failure(
        ServerError(
          statusCode: 422,
          message: 'No preview',
          code: 'THUMBNAIL_UNAVAILABLE',
        ),
      );

  @override
  Future<Result<Uint8List, AppError>> download(VaultFile file) async =>
      Success(Uint8List(file.size ?? 0));

  @override
  Future<Result<VaultFile, AppError>> rename(String id, String name) async {
    final i = files.indexWhere((f) => f.id == id);
    if (i == -1) return const Failure(UnknownError('Not found'));
    final old = files[i];
    return Success(
      files[i] = VaultFile(
        id: id,
        name: name,
        type: old.type,
        size: old.size,
        usedBy: old.usedBy,
        createdAt: old.createdAt,
      ),
    );
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    files.removeWhere((f) => f.id == id);
    return const Success(null);
  }
}
