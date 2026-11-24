/// OWE1 payload encryption, Dart side (MOB-2, D113).
///
/// The wire contract is docs/api/encryption.md, pinned by the shared vectors
/// at apps/api/crates/domain/testdata/owe1-vectors.json. The Rust API, the
/// web app's Node client and the Python AI client run the same file; so does
/// test/unit/owe1_vectors_test.dart.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

const int owe1Version = 1;
const int owe1NonceLength = 12;
const String owe1ContentType = 'application/vnd.oewang.owe1+json';

const _transcriptLabel = 'oewang/owe1/handshake';
const _infoC2s = 'oewang/owe1/c2s/';
const _infoS2c = 'oewang/owe1/s2c/';
const _tagLength = 16;

final _x25519 = X25519();
final _ed25519 = Ed25519();
final _aes = AesGcm.with256bits();

/// Any failure to open, verify or derive. Deliberately undifferentiated: a
/// caller must not branch on why a message failed to open.
class Owe1Exception implements Exception {
  const Owe1Exception(this.message);
  final String message;

  @override
  String toString() => 'Owe1Exception: $message';
}

/// `{ "n": nonce, "c": ciphertext || tag }`, both base64url without padding.
class SealedBody {
  const SealedBody({required this.n, required this.c});

  factory SealedBody.fromJson(Map<String, dynamic> json) =>
      SealedBody(n: json['n'] as String, c: json['c'] as String);

  final String n;
  final String c;

  Map<String, String> toJson() => {'n': n, 'c': c};
}

/// The two direction keys of one crypto session.
class Owe1Keys {
  const Owe1Keys({required this.clientToServer, required this.serverToClient});
  final Uint8List clientToServer;
  final Uint8List serverToClient;
}

/// base64url without padding (RFC 4648 section 5).
String b64(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

Uint8List unb64(String value) => base64Url.decode(base64Url.normalize(value));

// ------------------------------------------------------------ associated data
//
// Changing one of these strings breaks every client. They are the wire
// contract, not an implementation detail.

Uint8List aadRequest(
  String sessionId,
  String method,
  String path,
  String requestId,
  int timestamp,
) => _utf8('OWE1|req|$sessionId|$method|$path|$requestId|$timestamp');

Uint8List aadQuery(
  String sessionId,
  String method,
  String path,
  String requestId,
  int timestamp,
) => _utf8('OWE1|qry|$sessionId|$method|$path|$requestId|$timestamp');

Uint8List aadResponse(String sessionId, String requestId, int status) =>
    _utf8('OWE1|res|$sessionId|$requestId|$status');

/// For the chat stream (M4): one seal per event, `seq` from 0.
Uint8List aadStreamEvent(String sessionId, String requestId, int seq) =>
    _utf8('OWE1|sse|$sessionId|$requestId|$seq');

// ------------------------------------------------------------ handshake

/// An ephemeral X25519 key pair. [seed] is only for the vector tests.
Future<SimpleKeyPair> newEphemeralKeyPair([List<int>? seed]) =>
    seed == null ? _x25519.newKeyPair() : _x25519.newKeyPairFromSeed(seed);

Future<Uint8List> rawPublicKey(SimpleKeyPair pair) async =>
    Uint8List.fromList((await pair.extractPublicKey()).bytes);

Future<Owe1Keys> deriveKeys({
  required SimpleKeyPair privateKey,
  required List<int> peerPublic,
  required List<int> clientNonce,
  required List<int> serverNonce,
  required String sessionId,
}) async {
  if (peerPublic.length != 32) throw const Owe1Exception('bad public key');
  final shared = await (await _x25519.sharedSecretKey(
    keyPair: privateKey,
    remotePublicKey: SimplePublicKey(peerPublic, type: KeyPairType.x25519),
  )).extractBytes();

  // A low-order peer point yields all zeros: a key the attacker already knows.
  if (shared.every((byte) => byte == 0)) {
    throw const Owe1Exception('low order point');
  }

  final salt = [...clientNonce, ...serverNonce];
  final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
  Future<Uint8List> expand(String info) async => Uint8List.fromList(
    await (await hkdf.deriveKey(
      secretKey: SecretKey(shared),
      nonce: salt,
      info: _utf8(info),
    )).extractBytes(),
  );

  return Owe1Keys(
    clientToServer: await expand('$_infoC2s$sessionId'),
    serverToClient: await expand('$_infoS2c$sessionId'),
  );
}

/// Every binary part is fixed size and the session id has a fixed shape, so
/// the concatenation is unambiguous without length prefixes.
Uint8List transcript({
  required List<int> clientPublic,
  required List<int> serverPublic,
  required List<int> clientNonce,
  required List<int> serverNonce,
  required String sessionId,
  required int expiresAt,
  required int serverTime,
}) => Uint8List.fromList([
  ..._utf8(_transcriptLabel),
  ...clientPublic,
  ...serverPublic,
  ...clientNonce,
  ...serverNonce,
  ..._utf8('$sessionId|$expiresAt|$serverTime'),
]);

Future<String> keyId(List<int> publicKey) async {
  final digest = await Sha256().hash(publicKey);
  return 'k-${b64(digest.bytes).substring(0, 12)}';
}

/// Verify or throw. A client that cannot verify stops; it never falls back
/// to plaintext (docs/api/encryption.md#handshake).
Future<void> verifyHandshake({
  required List<int> pinnedPublicKey,
  required List<int> signature,
  required List<int> body,
}) async {
  final ok = await _ed25519.verify(
    body,
    signature: Signature(
      signature,
      publicKey: SimplePublicKey(pinnedPublicKey, type: KeyPairType.ed25519),
    ),
  );
  if (!ok) throw const Owe1Exception('handshake signature did not verify');
}

// ------------------------------------------------------------ seal and open

/// A fresh random nonce per message unless one is supplied, which only the
/// vector tests do.
Future<SealedBody> seal(
  List<int> key,
  List<int> aad,
  List<int> plaintext, {
  List<int>? nonce,
}) async {
  final box = await _aes.encrypt(
    plaintext,
    secretKey: SecretKey(key),
    nonce: nonce ?? _aes.newNonce(),
    aad: aad,
  );
  // The tag travels appended to the ciphertext, as Rust and Python expect.
  return SealedBody(
    n: b64(box.nonce),
    c: b64([...box.cipherText, ...box.mac.bytes]),
  );
}

Future<Uint8List> open(List<int> key, List<int> aad, SealedBody body) async {
  final Uint8List nonce;
  final Uint8List payload;
  try {
    nonce = unb64(body.n);
    payload = unb64(body.c);
  } on FormatException {
    throw const Owe1Exception('malformed message');
  }
  if (nonce.length != owe1NonceLength) {
    throw const Owe1Exception('malformed nonce');
  }
  if (payload.length < _tagLength) {
    throw const Owe1Exception('ciphertext too short to carry a tag');
  }

  final split = payload.length - _tagLength;
  try {
    return Uint8List.fromList(
      await _aes.decrypt(
        SecretBox(
          payload.sublist(0, split),
          nonce: nonce,
          mac: Mac(payload.sublist(split)),
        ),
        secretKey: SecretKey(key),
        aad: aad,
      ),
    );
  } on SecretBoxAuthenticationError {
    throw const Owe1Exception('decryption failed');
  }
}

/// Header-carried fields travel as `nonce.ciphertext`.
Future<String> sealField(List<int> key, List<int> aad, List<int> plain) async {
  final body = await seal(key, aad, plain);
  return '${body.n}.${body.c}';
}

Future<Uint8List> openField(List<int> key, List<int> aad, String value) {
  if (value.isEmpty) return Future.value(Uint8List(0));
  final separator = value.indexOf('.');
  if (separator == -1) throw const Owe1Exception('malformed field');
  return open(
    key,
    aad,
    SealedBody(
      n: value.substring(0, separator),
      c: value.substring(separator + 1),
    ),
  );
}

/// `kid:base64,kid:base64`, the format of the web app's
/// `CRYPTO_SIGNING_PUBLIC_KEYS` and of the `OWE1_SIGNING_KEYS` dart-define.
Map<String, Uint8List> parsePinnedKeys(String configured) {
  final keys = <String, Uint8List>{};
  for (final pair in configured.split(',')) {
    final trimmed = pair.trim();
    if (trimmed.isEmpty) continue;
    final colon = trimmed.indexOf(':');
    if (colon <= 0) throw const Owe1Exception('malformed pinned key');
    keys[trimmed.substring(0, colon).trim()] = unb64(
      trimmed.substring(colon + 1).trim(),
    );
  }
  return keys;
}

Uint8List _utf8(String value) => Uint8List.fromList(utf8.encode(value));
