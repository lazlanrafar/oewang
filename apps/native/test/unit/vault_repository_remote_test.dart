import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_remote/vault_repository_remote.dart';
import 'package:oewang/domain/models/vault_file.dart';

import '../support/fake_owe1_api.dart';

/// 1.2 MB of distinct bytes: three chunks, the last one short.
final _bytes = Uint8List.fromList(
  List.generate(1200 * 1024, (i) => (i * 7) % 256),
);
const _chunk = 512 * 1024;

void main() {
  group('MOB-8 vault file bytes', () {
    test('uploads in order: begin, every chunk, complete', () async {
      final received = <int, List<int>>{};
      final server = FakeOwe1Api((api, req) async {
        final body = req.body as Map<String, dynamic>?;
        if (req.method == 'POST' && req.path == '/v1/vault/files') {
          expect(body, {
            'filename': 'receipt.jpg',
            'content_type': 'image/jpeg',
            'size_bytes': _bytes.length,
          });
          return api.envelope(req, {
            'id': 'f1',
            'chunk_size': _chunk,
            'chunk_count': 3,
            'status': 'pending',
          });
        }
        if (req.method == 'PUT') {
          final index = int.parse(req.path.split('/').last);
          received[index] = base64.decode(body!['data'] as String);
          return api.envelope(req, null);
        }
        return api.envelope(req, {
          'id': 'f1',
          'name': 'receipt.jpg',
          'type': 'image/jpeg',
          'size': _bytes.length,
          'status': 'ready',
          'tags': <String>[],
          'thumbnail': null,
          'created_at': '2026-11-23T00:00:00Z',
        });
      });

      final dir = await Directory.systemTemp.createTemp('oew088');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/receipt.jpg')..writeAsBytesSync(_bytes);

      final res = await VaultRepositoryRemote(server.client()).upload(file);

      expect(res.fold((f) => f.id, (e) => e), 'f1');
      expect(server.requests.map((r) => r.toString()), [
        'POST /v1/vault/files',
        'PUT /v1/vault/files/f1/chunks/0',
        'PUT /v1/vault/files/f1/chunks/1',
        'PUT /v1/vault/files/f1/chunks/2',
        'POST /v1/vault/files/f1/complete',
      ]);
      expect(received[0]!.length, _chunk);
      expect(received[2]!.length, _bytes.length - 2 * _chunk);
      expect([...received[0]!, ...received[1]!, ...received[2]!], _bytes);
    });

    test('downloads every chunk the size implies and assembles them', () async {
      final server = FakeOwe1Api((api, req) async {
        final index = int.parse(req.path.split('/').last);
        final end = ((index + 1) * _chunk).clamp(0, _bytes.length);
        return api.envelope(req, {
          'index': index,
          'data': base64.encode(_bytes.sublist(index * _chunk, end)),
        });
      });

      final res = await VaultRepositoryRemote(
        server.client(),
      ).download(VaultFile(id: 'f1', size: _bytes.length));

      expect(server.requests.map((r) => r.toString()), [
        'GET /v1/vault/files/f1/chunks/0',
        'GET /v1/vault/files/f1/chunks/1',
        'GET /v1/vault/files/f1/chunks/2',
      ]);
      expect(res, isA<Success<Uint8List, Object>>());
      expect((res as Success<Uint8List, Object>).value, _bytes);
    });

    test('a refused chunk stops the upload and surfaces the code', () async {
      final server = FakeOwe1Api((api, req) async {
        if (req.method == 'PUT') {
          return api.envelope(req, null, status: 413, code: 'FILE_TOO_LARGE');
        }
        return api.envelope(req, {
          'id': 'f1',
          'chunk_size': _chunk,
          'chunk_count': 3,
          'status': 'pending',
        });
      });
      final dir = await Directory.systemTemp.createTemp('oew088');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/a.png')..writeAsBytesSync(_bytes);

      final res = await VaultRepositoryRemote(server.client()).upload(file);

      expect(res.fold((_) => null, (e) => e.code), 'FILE_TOO_LARGE');
      expect(
        server.requests.last.toString(),
        'PUT /v1/vault/files/f1/chunks/0',
      );
    });

    test('lists with the filters sealed in the query', () async {
      final server = FakeOwe1Api(
        (api, req) => api.envelope(
          req,
          [
            {'id': 'f1', 'name': 'a.jpg', 'type': 'image/jpeg', 'size': 10},
          ],
          meta: {'page': 1, 'total_pages': 2},
        ),
      );
      final res = await VaultRepositoryRemote(
        server.client(),
      ).list(const VaultQuery(search: 'warung', type: 'image'));
      expect(
        server.requests.single.query,
        'search=warung&type=image&sort=newest&page=1&limit=30',
      );
      expect(res.fold((v) => v.hasMore, (_) => null), isTrue);
    });
  });
}
