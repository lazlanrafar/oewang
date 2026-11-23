import 'dart:math';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';

/// One verified crypto session: its id, both keys, and how far the device
/// clock is from the server's.
class Owe1Session {
  const Owe1Session({
    required this.id,
    required this.keys,
    required this.expiresAt,
    required this.clockOffset,
  });

  final String id;
  final Owe1Keys keys;

  /// Server seconds.
  final int expiresAt;

  /// `server_time - local_time` at the handshake, in seconds. A phone's
  /// clock is the user's to set; the API accepts 120 s of skew.
  final int clockOffset;

  int serverNow() => _localSecs() + clockOffset;
}

/// Runs the handshake and holds the one live session, so concurrent requests
/// share a single handshake (docs/api/encryption.md#handshake).
class Owe1SessionStore {
  Owe1SessionStore({
    required this.apiUrl,
    required this.pinnedKeys,
    Dio? handshakeDio,
  }) : _dio = handshakeDio ?? Dio();

  final String apiUrl;

  /// kid to raw Ed25519 public key. A kid not here is refused.
  final Map<String, Uint8List> pinnedKeys;

  /// Plain Dio, no interceptors: the handshake is the one plaintext route.
  final Dio _dio;

  Owe1Session? _session;
  Future<Owe1Session>? _inflight;

  Future<Owe1Session> current() {
    final live = _session;
    if (live != null && live.expiresAt > live.serverNow() + 60) {
      return Future.value(live);
    }
    return _inflight ??= _handshake()
        .then((fresh) => _session = fresh)
        .whenComplete(() => _inflight = null);
  }

  /// Drop the session after `CRYPTO_SESSION_UNKNOWN` or `CRYPTO_CLOCK_SKEW`;
  /// the next [current] handshakes again and re-reads the server clock.
  void reset(Owe1Session stale) {
    if (identical(_session, stale)) _session = null;
  }

  Future<Owe1Session> _handshake() async {
    if (pinnedKeys.isEmpty) {
      throw const Owe1Exception('no pinned signing key; set OWE1_SIGNING_KEYS');
    }
    final pair = await newEphemeralKeyPair();
    final clientPublic = await rawPublicKey(pair);
    final clientNonce = _randomBytes(16);

    final response = await _dio.post<Map<String, dynamic>>(
      '$apiUrl/v1/handshake',
      data: {
        'v': owe1Version,
        'client_public_key': b64(clientPublic),
        'client_nonce': b64(clientNonce),
      },
      options: Options(contentType: Headers.jsonContentType),
    );
    final body = response.data;
    if (body == null) throw const Owe1Exception('empty handshake');

    final sessionId = body['session_id'] as String;
    final serverPublic = unb64(body['server_public_key'] as String);
    final serverNonce = unb64(body['server_nonce'] as String);
    final serverTime = (body['server_time'] as num).toInt();
    final expiresAt = (body['expires_at'] as num).toInt();

    final pinned = pinnedKeys[body['kid']];
    if (pinned == null) throw const Owe1Exception('unknown signing key');

    // Verify or stop. Never fall back to plaintext.
    await verifyHandshake(
      pinnedPublicKey: pinned,
      signature: unb64(body['signature'] as String),
      body: transcript(
        clientPublic: clientPublic,
        serverPublic: serverPublic,
        clientNonce: clientNonce,
        serverNonce: serverNonce,
        sessionId: sessionId,
        expiresAt: expiresAt,
        serverTime: serverTime,
      ),
    );

    return Owe1Session(
      id: sessionId,
      keys: await deriveKeys(
        privateKey: pair,
        peerPublic: serverPublic,
        clientNonce: clientNonce,
        serverNonce: serverNonce,
        sessionId: sessionId,
      ),
      expiresAt: expiresAt,
      clockOffset: serverTime - _localSecs(),
    );
  }
}

final _random = Random.secure();

Uint8List _randomBytes(int length) =>
    Uint8List.fromList(List.generate(length, (_) => _random.nextInt(256)));

/// A new id per request, retries included (replay protection keys on it).
String newRequestId() => _randomBytes(
  16,
).map((b) => b.toRadixString(16).padLeft(2, '0')).join().toUpperCase();

int _localSecs() => DateTime.now().millisecondsSinceEpoch ~/ 1000;
