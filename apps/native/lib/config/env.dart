import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Reads runtime configuration from `.env` (bundled as an asset).
class EnvConfig {
  const EnvConfig({
    required this.apiUrl,
    required this.encryptionKey,
    required this.sessionCookieName,
  });

  factory EnvConfig.fromDotEnv() {
    return EnvConfig(
      apiUrl: dotenv.maybeGet('API_URL') ?? 'http://localhost:3002',
      encryptionKey: dotenv.maybeGet('ENCRYPTION_KEY') ?? '',
      sessionCookieName:
          dotenv.maybeGet('SESSION_COOKIE_NAME') ?? 'oewang-session',
    );
  }

  final String apiUrl;
  final String encryptionKey;
  final String sessionCookieName;
}
