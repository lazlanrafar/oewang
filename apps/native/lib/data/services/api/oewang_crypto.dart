import 'dart:convert';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

/// AES-256-GCM port of `packages/encryption/index.ts`.
///
/// Wire format (matches the Node implementation 1:1):
///
///     <iv_hex>:<ciphertext_hex>:<tag_hex>
///
/// - Secret is a 32-byte ASCII string used as the raw key (matching
///   `Buffer.from(secret)` on the Node side).
/// - IV is 16 random bytes per call.
/// - Auth tag is 16 bytes (128 bits).
class OewangCrypto {
  OewangCrypto({required this.secret, SecureRandom? random})
    : _random = random ?? _seededRandom() {
    if (secret.length != 32) {
      throw ArgumentError('Secret key must be 32 characters long');
    }
  }

  static const int _ivLength = 16;
  static const int _tagBits = 128;

  final String secret;
  final SecureRandom _random;

  String encrypt(String plaintext) {
    final iv = _random.nextBytes(_ivLength);
    final key = Uint8List.fromList(secret.codeUnits);

    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        true,
        AEADParameters(
          KeyParameter(key),
          _tagBits,
          iv,
          Uint8List(0),
        ),
      );

    final input = Uint8List.fromList(utf8.encode(plaintext));
    final output = cipher.process(input);
    final ctLen = output.length - (_tagBits ~/ 8);
    final ciphertext = Uint8List.sublistView(output, 0, ctLen);
    final tag = Uint8List.sublistView(output, ctLen);

    return '${_hex(iv)}:${_hex(ciphertext)}:${_hex(tag)}';
  }

  String decrypt(String payload) {
    final parts = payload.split(':');
    if (parts.length != 3) {
      throw const FormatException('Invalid encrypted text format');
    }
    final iv = _fromHex(parts[0]);
    final ciphertext = _fromHex(parts[1]);
    final tag = _fromHex(parts[2]);
    final key = Uint8List.fromList(secret.codeUnits);

    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        false,
        AEADParameters(
          KeyParameter(key),
          _tagBits,
          iv,
          Uint8List(0),
        ),
      );

    final input = Uint8List(ciphertext.length + tag.length)
      ..setRange(0, ciphertext.length, ciphertext)
      ..setRange(ciphertext.length, ciphertext.length + tag.length, tag);

    final plain = cipher.process(input);
    return utf8.decode(plain);
  }

  static SecureRandom _seededRandom() {
    final random = FortunaRandom();
    final seedSource = DateTime.now().microsecondsSinceEpoch;
    final seed = Uint8List(32);
    for (var i = 0; i < 32; i++) {
      seed[i] = (seedSource >> (i % 8)) & 0xff;
    }
    random.seed(KeyParameter(seed));
    return random;
  }

  static String _hex(Uint8List bytes) {
    final buffer = StringBuffer();
    for (final b in bytes) {
      buffer.write(b.toRadixString(16).padLeft(2, '0'));
    }
    return buffer.toString();
  }

  static Uint8List _fromHex(String hex) {
    if (hex.length.isOdd) {
      throw const FormatException('Invalid hex length');
    }
    final out = Uint8List(hex.length ~/ 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return out;
  }
}
