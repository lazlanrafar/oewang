import 'package:flutter/foundation.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

/// The device's own passkey prompt (MOB-9, D110), around the `passkeys`
/// package. Takes and returns the WebAuthn JSON the API speaks.
class DevicePasskeys {
  DevicePasskeys({this.onAndroid = false});

  /// `PASSKEYS_ANDROID`, see [offered].
  final bool onAndroid;

  final _authenticator = PasskeyAuthenticator();

  /// Whether [platform] may offer passkeys at all, before asking the device.
  ///
  /// iOS always: it reports the relying party's own origin, which the site's
  /// `webcredentials` vouches for. Android only with `PASSKEYS_ANDROID`
  /// (D119): it reports `android:apk-key-hash:<sha256 of the signing cert>`,
  /// which the API admits and `assetlinks.json` vouches for only once that
  /// certificate's fingerprint is configured.
  static bool offered(TargetPlatform platform, {required bool onAndroid}) =>
      platform == TargetPlatform.iOS ||
      (platform == TargetPlatform.android && onAndroid);

  /// Whether to offer passkeys on this device at all.
  Future<bool> supported() async {
    final platform = defaultTargetPlatform;
    if (!offered(platform, onAndroid: onAndroid)) return false;
    try {
      final availability = _authenticator.getAvailability();
      return platform == TargetPlatform.iOS
          ? (await availability.iOS()).hasPasskeySupport
          : (await availability.android()).hasPasskeySupport;
    } on Exception {
      return false;
    }
  }

  /// Makes a passkey from `PublicKeyCredentialCreationOptions`.
  Future<Map<String, dynamic>> create(Map<String, dynamic> options) async =>
      (await _authenticator.register(
        RegisterRequestType.fromJson(options),
      )).toJson();

  /// Signs a discoverable `PublicKeyCredentialRequestOptions` challenge.
  Future<Map<String, dynamic>> get(Map<String, dynamic> options) async =>
      (await _authenticator.authenticate(
        AuthenticateRequestType.fromJson(
          options,
          preferImmediatelyAvailableCredentials: false,
        ),
      )).toJson();
}
