import 'dart:convert';
import 'dart:typed_data';
import 'package:pointycastle/export.dart';

/// AES-256-GCM decryptor matching the Node.js encryption in packages/encryption.
///
/// Wire format from apps/api encryption plugin:
///   `{iv_hex}:{ciphertext_hex}:{auth_tag_hex}`
///
/// Parsing uses indexOf/lastIndexOf (not split) so any colons that appear
/// inside the ciphertext hex are handled correctly.
class AesGcmDecryptor {
  AesGcmDecryptor._();

  /// Decrypt an AES-256-GCM encrypted string.
  ///
  /// [encrypted] — raw wire string: `iv_hex:ciphertext_hex:tag_hex`
  /// [key]       — 32-character UTF-8 encryption key (ENCRYPTION_KEY from .env)
  static String decrypt(String encrypted, String key) {
    // ── Parse: iv:ciphertext:tag ────────────────────────────────────────────
    // Use indexOf/lastIndexOf instead of split so any extra `:` characters
    // inside the ciphertext are handled correctly.
    final firstColon = encrypted.indexOf(':');
    final lastColon = encrypted.lastIndexOf(':');

    if (firstColon == -1 || lastColon == firstColon) {
      throw FormatException(
        'Invalid encrypted format — expected iv:ciphertext:tag '
        '(found ${encrypted.split(':').length} colon-delimited parts). '
        'First 40 chars: "${encrypted.substring(0, encrypted.length.clamp(0, 40))}"',
      );
    }

    final ivHex = encrypted.substring(0, firstColon);
    final ciphertextHex = encrypted.substring(firstColon + 1, lastColon);
    final tagHex = encrypted.substring(lastColon + 1);

    if (ivHex.isEmpty || ciphertextHex.isEmpty || tagHex.isEmpty) {
      throw FormatException('One or more AES-GCM segments are empty.');
    }

    final iv = _fromHex(ivHex);
    final ciphertext = _fromHex(ciphertextHex);
    final tag = _fromHex(tagHex);

    // ── Key ─────────────────────────────────────────────────────────────────
    final keyBytes = Uint8List.fromList(utf8.encode(key));
    if (keyBytes.length != 32) {
      throw ArgumentError(
        'ENCRYPTION_KEY must be exactly 32 bytes, got ${keyBytes.length}.',
      );
    }

    // ── Decrypt via pointycastle AES-GCM ────────────────────────────────────
    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        false, // false = decrypt
        AEADParameters(
          KeyParameter(keyBytes),
          128, // auth tag length in bits (16 bytes)
          iv,
          Uint8List(0), // no additional associated data
        ),
      );

    // pointycastle expects ciphertext || tag concatenated
    final ciphertextWithTag = Uint8List(ciphertext.length + tag.length)
      ..setAll(0, ciphertext)
      ..setAll(ciphertext.length, tag);

    final decrypted = cipher.process(ciphertextWithTag);
    return utf8.decode(decrypted);
  }

  static Uint8List _fromHex(String hex) {
    if (hex.length.isOdd) {
      throw FormatException('Odd-length hex string: "$hex"');
    }
    final result = Uint8List(hex.length ~/ 2);
    for (var i = 0; i < hex.length; i += 2) {
      result[i ~/ 2] = int.parse(hex.substring(i, i + 2), radix: 16);
    }
    return result;
  }
}
