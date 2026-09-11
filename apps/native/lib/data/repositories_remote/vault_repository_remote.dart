import 'dart:io';

import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/vault_file.dart';

class VaultRepositoryRemote implements VaultRepository {
  VaultRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<VaultFile, AppError>> upload(File file) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path),
      });
      final res = await _api.post('/vault/upload', data: formData);
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected upload response'),
        );
      }
      return Success(
        VaultFile(
          id: json['id'] as String,
          name: json['name'] as String?,
          type: json['type'] as String?,
          size: (json['size'] as num?)?.toInt(),
        ),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<String, AppError>> getDownloadUrl(String id) async {
    try {
      final res = await _api.get('/vault/$id/download');
      final json = (res.data as Map<String, dynamic>)['data'];
      final url = json is Map<String, dynamic> ? json['url'] : null;
      if (url is! String) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected download response'),
        );
      }
      return Success(url);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
