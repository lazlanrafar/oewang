import 'dart:io';

import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/domain/models/vault_file.dart';

class VaultRepositoryFake implements VaultRepository {
  int _counter = 0;

  @override
  Future<Result<VaultFile, AppError>> upload(File file) async {
    _counter++;
    return Success(VaultFile(id: 'fake-vault-file-$_counter', name: file.path));
  }

  @override
  Future<Result<String, AppError>> getDownloadUrl(String id) async =>
      Success('https://example.com/fake-vault/$id');
}
