import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/api/auth_interceptor.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';
import 'package:oewang/data/services/api/owe1/owe1_session.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

/// Tokens in memory instead of the keystore.
class _MemoryStorage extends SecureStorageService {
  _MemoryStorage({this.access, this.refresh})
    : super(storage: const FlutterSecureStorage());
  String? access;
  String? refresh;

  @override
  Future<String?> readAccessToken() async => access;
  @override
  Future<String?> readRefreshToken() async => refresh;
  @override
  Future<void> writeTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    access = accessToken;
    refresh = refreshToken;
  }

  @override
  Future<void> clear() async => access = refresh = null;
}

/// The API's side of OWE1 and of the auth routes, enough to drive the
/// client's interceptors end to end: it really opens what the app sealed
/// and seals what it answers.
class _FakeApi implements HttpClientAdapter {
  _FakeApi(this.signing);
  final SimpleKeyPair signing;

  final _sessions = <String, Owe1Keys>{};
  int handshakes = 0;
  int refreshes = 0;

  /// Requests that reached a route, as `METHOD path?query`.
  final routed = <String>[];

  /// Bodies the routes received, opened.
  final bodies = <Object?>[];

  /// The next request answers `CRYPTO_SESSION_UNKNOWN`, as after a restart.
  bool forgetSessions = false;

  /// The access token the API accepts; anything else is `UNAUTHENTICATED`.
  String validAccess = 'access-2';
  bool refuseRefresh = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.uri.path == '/v1/handshake') return _handshake(options);

    if (forgetSessions) {
      forgetSessions = false;
      _sessions.clear();
    }
    final sessionId = options.headers['x-owe-session'] as String;
    final keys = _sessions[sessionId];
    if (keys == null) {
      return _plain(401, 'CRYPTO_SESSION_UNKNOWN');
    }
    final requestId = options.headers['x-owe-request-id'] as String;
    final timestamp = int.parse(options.headers['x-owe-timestamp'] as String);
    final method = options.method;
    final path = options.uri.path;
    expect(options.uri.query, isEmpty, reason: 'no plaintext query string');

    final query = utf8.decode(
      await openField(
        keys.clientToServer,
        aadQuery(sessionId, method, path, requestId, timestamp),
        options.headers['x-owe-query'] as String,
      ),
    );
    Object? body;
    if (options.data != null) {
      body = jsonDecode(
        utf8.decode(
          await open(
            keys.clientToServer,
            aadRequest(sessionId, method, path, requestId, timestamp),
            SealedBody.fromJson(
              jsonDecode(options.data as String) as Map<String, dynamic>,
            ),
          ),
        ),
      );
    }
    routed.add(query.isEmpty ? '$method $path' : '$method $path?$query');
    bodies.add(body);

    final (status, envelope) = _route(path, options, body);
    final sealed = await seal(
      keys.serverToClient,
      aadResponse(sessionId, requestId, status),
      utf8.encode(jsonEncode(envelope)),
    );
    return ResponseBody.fromString(
      jsonEncode(sealed.toJson()),
      status,
      headers: {
        Headers.contentTypeHeader: [owe1ContentType],
      },
    );
  }

  (int, Map<String, Object?>) _route(
    String path,
    RequestOptions options,
    Object? body,
  ) {
    if (path == '/v1/auth/refresh') {
      refreshes++;
      if (refuseRefresh) return (401, _error('UNAUTHENTICATED'));
      validAccess = 'access-${refreshes + 2}';
      return (
        200,
        {
          'data': {
            'access_token': validAccess,
            'refresh_token': 'refresh-${refreshes + 2}',
          },
          'error': null,
        },
      );
    }
    if (options.headers['Authorization'] != 'Bearer $validAccess') {
      return (401, _error('UNAUTHENTICATED'));
    }
    return (
      200,
      {
        'data': {'ok': true, 'amount': '12345678901234.5678'},
        'error': null,
      },
    );
  }

  Map<String, Object?> _error(String code) => {
    'data': null,
    'error': {'code': code, 'message': code, 'request_id': 'r'},
  };

  Future<ResponseBody> _handshake(RequestOptions options) async {
    handshakes++;
    final req = options.data as Map<String, dynamic>;
    final clientPublic = unb64(req['client_public_key'] as String);
    final clientNonce = unb64(req['client_nonce'] as String);
    final server = await newEphemeralKeyPair();
    final serverPublic = await rawPublicKey(server);
    final serverNonce = Uint8List.fromList(List.filled(16, handshakes));
    final sessionId = 'cs_test$handshakes';
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;

    _sessions[sessionId] = await deriveKeys(
      privateKey: server,
      peerPublic: clientPublic,
      clientNonce: clientNonce,
      serverNonce: serverNonce,
      sessionId: sessionId,
    );
    final signature = await Ed25519().sign(
      transcript(
        clientPublic: clientPublic,
        serverPublic: serverPublic,
        clientNonce: clientNonce,
        serverNonce: serverNonce,
        sessionId: sessionId,
        expiresAt: now + 86400,
        serverTime: now,
      ),
      keyPair: signing,
    );
    return ResponseBody.fromString(
      jsonEncode({
        'v': 1,
        'session_id': sessionId,
        'server_public_key': b64(serverPublic),
        'server_nonce': b64(serverNonce),
        'server_time': now,
        'expires_at': now + 86400,
        'kid': 'k-test',
        'signature': b64(signature.bytes),
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  ResponseBody _plain(int status, String code) => ResponseBody.fromString(
    jsonEncode(_error(code)),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      'x-owe-transport-error': ['1'],
    },
  );

  @override
  void close({bool force = false}) {}
}

void main() {
  late SimpleKeyPair signing;
  late Uint8List signingPublic;

  setUpAll(() async {
    signing = await Ed25519().newKeyPair();
    signingPublic = Uint8List.fromList(
      (await signing.extractPublicKey()).bytes,
    );
  });

  ({ApiClient api, _FakeApi server, _MemoryStorage storage, List<int> outs})
  build({Uint8List? pinned, String access = 'access-2'}) {
    final server = _FakeApi(signing);
    final storage = _MemoryStorage(access: access, refresh: 'refresh-2');
    final outs = <int>[];
    final sessions = Owe1SessionStore(
      apiUrl: 'http://api.test',
      pinnedKeys: {'k-test': pinned ?? signingPublic},
      handshakeDio: Dio()..httpClientAdapter = server,
    );
    final api = ApiClient.build(
      env: const EnvConfig(
        apiUrl: 'http://api.test',
        signingKeys: '',
        appUrl: '',
        sentryDsn: '',
      ),
      storage: storage,
      sessions: sessions,
      onSignedOut: () async => outs.add(1),
    );
    api.dioForTest.httpClientAdapter = server;
    return (api: api, server: server, storage: storage, outs: outs);
  }

  group('MOB-2 OWE1 interceptor', () {
    test('seals the body and the query, and opens the answer', () async {
      final t = build();
      final res = await t.api.post(
        '/transactions',
        data: {'amount': '50000.0000'},
      );
      expect(res.data, {
        'data': {'ok': true, 'amount': '12345678901234.5678'},
        'error': null,
      });
      expect(t.server.bodies.single, {'amount': '50000.0000'});

      await t.api.get(
        '/transactions',
        queryParameters: {
          'type': 'expense',
          'wallet_id': ['a', 'b'],
          'search': 'nasi goreng',
          'page': null,
        },
      );
      const query = 'type=expense&wallet_id=a&wallet_id=b&search=nasi+goreng';
      expect(t.server.routed.last, 'GET /v1/transactions?$query');
      // One handshake serves both calls.
      expect(t.server.handshakes, 1);
    });

    test(
      'CRYPTO_SESSION_UNKNOWN runs one new handshake and one retry',
      () async {
        final t = build();
        await t.api.get('/workspaces');
        t.server.forgetSessions = true;

        final res = await t.api.post('/transactions', data: {'a': '1'});

        expect(res.statusCode, 200);
        expect(t.server.handshakes, 2);
        // The retry carried the same plaintext body, sealed again.
        expect(t.server.bodies.last, {'a': '1'});
      },
    );

    test('a handshake signed by a key that is not pinned is refused', () async {
      final other = await Ed25519().newKeyPair();
      final t = build(
        pinned: Uint8List.fromList((await other.extractPublicKey()).bytes),
      );
      await expectLater(
        t.api.get('/workspaces'),
        throwsA(
          isA<DioException>().having(
            (e) => e.error,
            'error',
            isA<Owe1Exception>(),
          ),
        ),
      );
      expect(t.server.routed, isEmpty, reason: 'nothing sent in plaintext');
    });
  });

  group('MOB-2 auth interceptor', () {
    test(
      '401 UNAUTHENTICATED refreshes once, stores the pair, retries',
      () async {
        final t = build(access: 'access-expired');
        t.server.validAccess = 'access-never-matches-until-refresh';

        final res = await t.api.get('/auth/me');

        expect(res.statusCode, 200);
        expect(t.server.refreshes, 1);
        expect(t.server.bodies[1], {'refresh_token': 'refresh-2'});
        expect(t.storage.access, 'access-3');
        expect(t.storage.refresh, 'refresh-3');
        expect(t.outs, isEmpty);
      },
    );

    test('concurrent 401s share one refresh (reuse would revoke)', () async {
      final t = build(access: 'access-expired');
      t.server.validAccess = 'stale';

      final all = await Future.wait([
        t.api.get('/auth/me'),
        t.api.get('/workspaces'),
        t.api.get('/transactions'),
      ]);

      expect(all.map((r) => r.statusCode), [200, 200, 200]);
      expect(t.server.refreshes, 1);
    });

    test('a queued write for another workspace never leaves', () async {
      String jwt(String wid) =>
          'h.${base64Url.encode(utf8.encode(jsonEncode({'wid': wid}))).replaceAll('=', '')}.s';
      final t = build(access: jwt('ws_b'));
      t.server.validAccess = jwt('ws_b');

      await expectLater(
        t.api.post(
          '/wallets',
          data: {'name': 'Cash'},
          extra: {AuthInterceptor.workspace: 'ws_a'},
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.cancel,
          ),
        ),
      );
      expect(t.server.routed, isEmpty);

      await t.api.post(
        '/wallets',
        data: {'name': 'Cash'},
        extra: {AuthInterceptor.workspace: 'ws_b'},
      );
      expect(t.server.routed, ['POST /v1/wallets']);
    });

    test('a refused refresh clears the tokens and signs out', () async {
      final t = build(access: 'access-expired');
      t.server
        ..validAccess = 'stale'
        ..refuseRefresh = true;

      await expectLater(
        t.api.get('/auth/me'),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            401,
          ),
        ),
      );
      expect(t.server.refreshes, 1);
      expect(t.storage.access, isNull);
      expect(t.storage.refresh, isNull);
      expect(t.outs, [1]);
    });
  });
}
