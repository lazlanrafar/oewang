// Runs the shared OWE1 vectors. The same file is run by the Rust API that
// generated it, the web app's Node client and the Python AI client; if any of
// the four changes its bytes, its own test fails.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';

File _vectorsFile() {
  final fromEnv = Platform.environment['OWE1_VECTORS_PATH'];
  if (fromEnv != null && fromEnv.isNotEmpty) return File(fromEnv);
  var dir = Directory.current.absolute;
  while (true) {
    final candidate = File(
      '${dir.path}/apps/api/crates/domain/testdata/owe1-vectors.json',
    );
    if (candidate.existsSync()) return candidate;
    final parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError('shared OWE1 vectors not found; set OWE1_VECTORS_PATH');
}

void main() {
  final vectors =
      jsonDecode(_vectorsFile().readAsStringSync()) as Map<String, dynamic>;
  final inputs = vectors['inputs'] as Map<String, dynamic>;
  final derived = vectors['derived'] as Map<String, dynamic>;
  final messages = vectors['messages'] as Map<String, dynamic>;

  final sessionId = inputs['session_id'] as String;
  final requestId = inputs['request_id'] as String;
  final timestamp = inputs['timestamp'] as int;
  final sealNonce = unb64(inputs['seal_nonce'] as String);

  late Owe1Keys keys;

  setUpAll(() async {
    final client = await newEphemeralKeyPair(
      unb64(inputs['client_secret'] as String),
    );
    keys = await deriveKeys(
      privateKey: client,
      peerPublic: unb64(inputs['server_public_key'] as String),
      clientNonce: unb64(inputs['client_nonce'] as String),
      serverNonce: unb64(inputs['server_nonce'] as String),
      sessionId: sessionId,
    );
  });

  group('MOB-2 OWE1 shared vectors', () {
    test('the client secret gives the client public key', () async {
      final client = await newEphemeralKeyPair(
        unb64(inputs['client_secret'] as String),
      );
      expect(b64(await rawPublicKey(client)), inputs['client_public_key']);
    });

    test('derives the same keys as the Rust implementation', () {
      expect(b64(keys.clientToServer), derived['k_c2s']);
      expect(b64(keys.serverToClient), derived['k_s2c']);
    });

    test('builds the same transcript', () {
      final built = transcript(
        clientPublic: unb64(inputs['client_public_key'] as String),
        serverPublic: unb64(inputs['server_public_key'] as String),
        clientNonce: unb64(inputs['client_nonce'] as String),
        serverNonce: unb64(inputs['server_nonce'] as String),
        sessionId: sessionId,
        expiresAt: inputs['expires_at'] as int,
        serverTime: timestamp,
      );
      expect(b64(built), derived['transcript']);
    });

    test('derives the same key id', () async {
      expect(
        await keyId(unb64(inputs['server_public_key'] as String)),
        derived['key_id_of_server_public'],
      );
    });

    test('builds the same associated data', () {
      String s(List<int> bytes) => utf8.decode(bytes);
      final req = messages['request'] as Map<String, dynamic>;
      final qry = messages['query'] as Map<String, dynamic>;
      final res = messages['response'] as Map<String, dynamic>;
      final sse = messages['stream_event'] as Map<String, dynamic>;
      expect(
        s(
          aadRequest(
            sessionId,
            'POST',
            '/v1/transactions',
            requestId,
            timestamp,
          ),
        ),
        req['aad'],
      );
      expect(
        s(aadQuery(sessionId, 'GET', '/v1/transactions', requestId, timestamp)),
        qry['aad'],
      );
      expect(s(aadResponse(sessionId, requestId, 201)), res['aad']);
      expect(s(aadStreamEvent(sessionId, requestId, 0)), sse['aad']);
    });

    const directions = {
      'request': true,
      'query': true,
      'response': false,
      'stream_event': false,
    };

    for (final MapEntry(key: name, value: clientToServer)
        in directions.entries) {
      test('seals and opens the $name vector byte for byte', () async {
        final message = messages[name] as Map<String, dynamic>;
        final key = clientToServer ? keys.clientToServer : keys.serverToClient;
        final aad = utf8.encode(message['aad'] as String);
        final expected = SealedBody.fromJson(
          message['sealed'] as Map<String, dynamic>,
        );

        final sealed = await seal(
          key,
          aad,
          utf8.encode(message['plaintext'] as String),
          nonce: sealNonce,
        );
        expect(sealed.n, expected.n);
        expect(sealed.c, expected.c);

        final opened = await open(key, aad, expected);
        expect(utf8.decode(opened), message['plaintext']);
      });
    }

    test('refuses a message under the wrong associated data', () async {
      final message = messages['response'] as Map<String, dynamic>;
      final sealed = SealedBody.fromJson(
        message['sealed'] as Map<String, dynamic>,
      );
      // A 200 swapped in for the 201 the server sealed.
      final wrong = aadResponse(sessionId, requestId, 200);
      await expectLater(
        open(keys.serverToClient, wrong, sealed),
        throwsA(isA<Owe1Exception>()),
      );
    });

    test('a header field round-trips as nonce.ciphertext', () async {
      final aad = aadQuery(sessionId, 'GET', '/v1/x', requestId, timestamp);
      final field = await sealField(
        keys.clientToServer,
        aad,
        utf8.encode('type=expense'),
      );
      expect(field.split('.'), hasLength(2));
      final opened = await openField(keys.clientToServer, aad, field);
      expect(utf8.decode(opened), 'type=expense');
    });

    test('parses pinned keys in the web app format', () {
      final keys = parsePinnedKeys(
        'k-a:R9lb-h2ZeHpITjsEg3YFq3F2XXuo_SWO7aE3IpUesw0, k-b:AAAA',
      );
      expect(keys.keys, ['k-a', 'k-b']);
      expect(keys['k-a'], hasLength(32));
    });
  });
}
