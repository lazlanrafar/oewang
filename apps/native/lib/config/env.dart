/// Build-time configuration, from `--dart-define-from-file=env/<name>.json`
/// (docs/features/mobile.md#configuration). Nothing is read from a bundled
/// asset: a `.env` in the bundle is a file anyone can unzip.
class EnvConfig {
  const EnvConfig({
    required this.apiUrl,
    required this.signingKeys,
    required this.appUrl,
    required this.sentryDsn,
  });

  factory EnvConfig.fromDefines() => const EnvConfig(
    apiUrl: String.fromEnvironment(
      'API_URL',
      defaultValue: 'https://api.oewang.com',
    ),
    signingKeys: String.fromEnvironment('OWE1_SIGNING_KEYS'),
    appUrl: String.fromEnvironment(
      'APP_URL',
      defaultValue: 'https://app.oewang.com',
    ),
    sentryDsn: String.fromEnvironment('SENTRY_DSN'),
  );

  /// The API's origin, without `/v1`.
  final String apiUrl;

  /// The API's pinned Ed25519 public keys, `kid:base64url,...`. Empty means
  /// every handshake is refused: there is no plaintext fallback (D113).
  final String signingKeys;

  /// Base URL of the web app, for legal pages and invitation links.
  final String appUrl;

  /// Error monitoring DSN. Blank disables Sentry; debug builds never send.
  final String sentryDsn;
}
