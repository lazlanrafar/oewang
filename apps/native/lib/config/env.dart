import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Reads runtime configuration from `.env` (bundled as an asset).
class EnvConfig {
  const EnvConfig({
    required this.apiUrl,
    required this.appUrl,
    required this.encryptionKey,
    required this.sessionCookieName,
  });

  factory EnvConfig.fromDotEnv() {
    return EnvConfig(
      apiUrl: dotenv.maybeGet('API_URL') ?? 'http://localhost:3002',
      appUrl: dotenv.maybeGet('APP_URL') ?? 'http://localhost:3000',
      encryptionKey: dotenv.maybeGet('ENCRYPTION_KEY') ?? '',
      sessionCookieName:
          dotenv.maybeGet('SESSION_COOKIE_NAME') ?? 'oewang-session',
    );
  }

  final String apiUrl;

  /// Base URL of the web app (used to deep-link to billing/upgrade pages).
  final String appUrl;
  final String encryptionKey;
  final String sessionCookieName;
}
