import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/vault_file.dart';

/// docs/api/encryption.md#file-bytes. Chunks go one at a time, in order:
/// the API checks every index at `complete`, and a phone upload is at most
/// 20 chunks (10 MB).
class VaultRepositoryRemote implements VaultRepository {
  VaultRepositoryRemote(this._api);

  final ApiClient _api;

  /// The download side's chunk size; the upload side takes the API's.
  static const chunkBytes = 512 * 1024;

  static const _types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
  };

  @override
  Future<Result<VaultFile, AppError>> upload(File file) => _call(() async {
    final bytes = await file.readAsBytes();
    final name = file.uri.pathSegments.last;
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    // The API sniffs chunk 0 and refuses a mismatch (SEC-12), so a wrong
    // guess here fails loudly rather than storing a mislabelled file.
    final begun = _data(
      await _api.post(
        '/vault/files',
        data: {
          'filename': name,
          'content_type': _types[ext] ?? 'application/octet-stream',
          'size_bytes': bytes.length,
        },
      ),
    );
    final id = begun['id'] as String;
    final size = (begun['chunk_size'] as num).toInt();
    final count = (begun['chunk_count'] as num).toInt();
    for (var i = 0; i < count; i++) {
      final end = (i + 1) * size > bytes.length ? bytes.length : (i + 1) * size;
      await _api.put(
        '/vault/files/$id/chunks/$i',
        data: {'data': base64.encode(bytes.sublist(i * size, end))},
      );
    }
    return VaultFile.fromJson(
      _data(await _api.post('/vault/files/$id/complete')),
    );
  });

  @override
  Future<Result<({List<VaultFile> files, bool hasMore}), AppError>> list(
    VaultQuery query, {
    int page = 1,
  }) => _call(() async {
    final res = await _api.get(
      '/vault/files',
      queryParameters: {
        if (query.search.isNotEmpty) 'search': query.search,
        'type': query.type,
        'sort': query.sort,
        'page': page,
        'limit': 30,
      },
    );
    final rows = envelopeData(res) as List? ?? const [];
    final meta = (res.data as Map)['meta'];
    final pages = meta is Map ? (meta['total_pages'] as num?)?.toInt() : null;
    return (
      files: rows.cast<Map<String, dynamic>>().map(VaultFile.fromJson).toList(),
      hasMore: pages != null && page < pages,
    );
  });

  @override
  Future<Result<Uint8List, AppError>> thumbnail(String id) => _call(
    () async => base64.decode(
      _data(await _api.get('/vault/files/$id/thumbnail'))['data'] as String,
    ),
  );

  @override
  Future<Result<Uint8List, AppError>> download(VaultFile file) =>
      _call(() async {
        final size = file.size ?? 0;
        final count = size == 0 ? 1 : (size + chunkBytes - 1) ~/ chunkBytes;
        final out = BytesBuilder(copy: false);
        for (var i = 0; i < count; i++) {
          final chunk = _data(
            await _api.get('/vault/files/${file.id}/chunks/$i'),
          );
          out.add(base64.decode(chunk['data'] as String));
        }
        return out.takeBytes();
      });

  @override
  Future<Result<VaultFile, AppError>> rename(String id, String name) => _call(
    () async => VaultFile.fromJson(
      _data(await _api.patch('/vault/files/$id', data: {'name': name})),
    ),
  );

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _call(() => _api.delete('/vault/files/$id'));

  Map<String, dynamic> _data(Response<dynamic> res) {
    final data = envelopeData(res);
    if (data is! Map<String, dynamic>) {
      throw const ServerError(statusCode: 500, message: 'Unexpected response');
    }
    return data;
  }

  Future<Result<T, AppError>> _call<T>(Future<T> Function() run) async {
    try {
      return Success(await run());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on AppError catch (e) {
      return Failure(e);
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
