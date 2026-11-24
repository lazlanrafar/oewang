/// Build-time configuration, from `--dart-define-from-file=env/<name>.json`
/// (docs/features/mobile.md#configuration). Nothing is read from a bundled
/// asset: a `.env` in the bundle is a file anyone can unzip.
class EnvConfig {
  const EnvConfig({
    required this.apiUrl,
    required this.signingKeys,
    required this.appUrl,
    required this.sentryDsn,
    this.passkeysOnAndroid = false,
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
    passkeysOnAndroid: bool.fromEnvironment('PASSKEYS_ANDROID'),
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

  /// Offer passkeys on Android (D119). Off until the signing certificate's
  /// fingerprint is in `ANDROID_CERT_SHA256` on the API and the app: before
  /// that the site vouches for no Android app and every ceremony fails.
  final bool passkeysOnAndroid;
}
