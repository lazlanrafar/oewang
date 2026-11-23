import 'dart:io';

import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

/// The device's own passkey prompt (MOB-9, D110), around the `passkeys`
/// package. Takes and returns the WebAuthn JSON the API speaks.
class DevicePasskeys {
  final _authenticator = PasskeyAuthenticator();

  /// Whether to offer passkeys on this device at all.
  ///
  /// iOS only. iOS reports the relying party's own origin,
  /// `https://app.oewang.com`, which the API accepts once the app is in the
  /// site's `webcredentials` (OEW-098). Android reports
  /// `android:apk-key-hash:<sha256 of the signing cert>`, which the API's
  /// webauthn-rs refuses until that exact origin is appended to its allowed
  /// origins.
  // shortcut: Android hidden, until the API allows the apk-key-hash origin.
  Future<bool> supported() async {
    if (!Platform.isIOS) return false;
    try {
      final ios = await _authenticator.getAvailability().iOS();
      return ios.hasPasskeySupport;
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
