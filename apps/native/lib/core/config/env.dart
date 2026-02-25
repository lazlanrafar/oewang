import 'package:flutter_dotenv/flutter_dotenv.dart';

abstract class Env {
  static String get supabaseUrl => dotenv.env['SUPABASE_URL'] ?? '';
  static String get supabaseAnonKey => dotenv.env['SUPABASE_ANON_KEY'] ?? '';
  static String get apiBaseUrl =>
      dotenv.env['API_BASE_URL'] ?? 'http://localhost:3001';

  /// 32-byte AES-256 key shared with apps/api encryption plugin.
  static String get encryptionKey => dotenv.env['ENCRYPTION_KEY'] ?? '';
}
