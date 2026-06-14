import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/data/services/api/oewang_crypto.dart';

void main() {
  group('OewangCrypto', () {
    const secret = '01234567890123456789012345678901'; // 32 chars

    test('round-trips a JSON-shaped payload', () {
      final crypto = OewangCrypto(secret: secret);
      const original = '{"email":"a@b.com","password":"hunter2"}';

      final cipher = crypto.encrypt(original);
      expect(cipher.split(':').length, 3);

      final decrypted = crypto.decrypt(cipher);
      expect(decrypted, original);
    });

    test('different IVs produce different ciphertexts for the same input', () {
      final crypto = OewangCrypto(secret: secret);
      final a = crypto.encrypt('hello');
      final b = crypto.encrypt('hello');
      expect(a == b, isFalse);
    });

    test('rejects a malformed payload', () {
      final crypto = OewangCrypto(secret: secret);
      expect(
        () => crypto.decrypt('not-a-valid-payload'),
        throwsA(isA<FormatException>()),
      );
    });

    test('rejects a non-32-char key', () {
      expect(
        () => OewangCrypto(secret: 'short'),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
