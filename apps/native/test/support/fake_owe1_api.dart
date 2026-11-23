import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';
import 'package:oewang/data/services/api/owe1/owe1_session.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

/// One request as the API saw it, opened.
class FakeRequest {
  FakeRequest(this.method, this.path, this.query, this.body, this.requestId);
  final String method;
  final String path;
  final String query;
  final Object? body;
  final String requestId;

  @override
  String toString() => query.isEmpty ? '$method $path' : '$method $path?$query';
}

/// The API's side of OWE1 on a fixed session, with no handshake: it opens
/// what the real [ApiClient] sealed, hands it to [route], and gives the
/// route helpers to seal an envelope or a stream event back.
class FakeOwe1Api implements HttpClientAdapter {
  FakeOwe1Api(this.route);

  final Future<ResponseBody> Function(FakeOwe1Api api, FakeRequest req) route;
  final requests = <FakeRequest>[];

  final session = Owe1Session(
    id: 'cs_test0000000000000000001',
    keys: Owe1Keys(
      clientToServer: Uint8List.fromList(List.filled(32, 1)),
      serverToClient: Uint8List.fromList(List.filled(32, 2)),
    ),
    expiresAt: 1 << 40,
    clockOffset: 0,
  );

  ApiClient client() {
    final api = ApiClient.build(
      env: const EnvConfig(
        apiUrl: 'http://api.test',
        signingKeys: '',
        appUrl: '',
        sentryDsn: '',
      ),
      storage: _NoTokens(),
      sessions: _FixedSessions(session),
    );
    api.dioForTest.httpClientAdapter = this;
    return api;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final requestId = options.headers['x-owe-request-id'] as String;
    final timestamp = int.parse(options.headers['x-owe-timestamp'] as String);
    final method = options.method;
    final path = options.uri.path;
    final key = session.keys.clientToServer;
    final query = utf8.decode(
      await openField(
        key,
        aadQuery(session.id, method, path, requestId, timestamp),
        options.headers['x-owe-query'] as String,
      ),
    );
    Object? body;
    if (options.data != null) {
      body = jsonDecode(
        utf8.decode(
          await open(
            key,
            aadRequest(session.id, method, path, requestId, timestamp),
            SealedBody.fromJson(
              jsonDecode(options.data as String) as Map<String, dynamic>,
            ),
          ),
        ),
      );
    }
    final req = FakeRequest(method, path, query, body, requestId);
    requests.add(req);
    return route(this, req);
  }

  /// A sealed `{data, error, meta}` answer.
  Future<ResponseBody> envelope(
    FakeRequest req,
    Object? data, {
    int status = 200,
    String? code,
    Map<String, Object?>? meta,
  }) async {
    final sealed = await seal(
      session.keys.serverToClient,
      aadResponse(session.id, req.requestId, status),
      utf8.encode(
        jsonEncode({
          'data': data,
          'error': code == null ? null : {'code': code, 'message': code},
          'meta': meta,
        }),
      ),
    );
    return ResponseBody.fromString(
      jsonEncode(sealed.toJson()),
      status,
      headers: {
        Headers.contentTypeHeader: [owe1ContentType],
      },
    );
  }

  /// One SSE frame whose data is sealed for position [seq].
  Future<String> event(
    FakeRequest req,
    int seq,
    String name,
    Object payload,
  ) async {
    final sealed = await seal(
      session.keys.serverToClient,
      aadStreamEvent(session.id, req.requestId, seq),
      utf8.encode(jsonEncode(payload)),
    );
    return 'event: $name\ndata: ${jsonEncode(sealed.toJson())}\n\n';
  }

  /// An event-stream answer delivered in the given network chunks.
  ResponseBody stream(List<String> chunks) => ResponseBody(
    Stream.fromIterable(chunks.map((c) => Uint8List.fromList(utf8.encode(c)))),
    200,
    headers: {
      Headers.contentTypeHeader: ['text/event-stream'],
    },
  );

  @override
  void close({bool force = false}) {}
}

class _FixedSessions extends Owe1SessionStore {
  _FixedSessions(this.session)
    : super(apiUrl: 'http://api.test', pinnedKeys: const {});
  final Owe1Session session;

  @override
  Future<Owe1Session> current() async => session;
}

class _NoTokens extends SecureStorageService {
  _NoTokens() : super(storage: const FlutterSecureStorage());

  @override
  Future<String?> readAccessToken() async => 'access';
  @override
  Future<String?> readRefreshToken() async => 'refresh';
}
