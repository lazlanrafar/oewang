import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/passkeys/passkey_authenticator.dart';

/// D119: Android offers passkeys only with the `PASSKEYS_ANDROID` define.
void main() {
  test('iOS offers passkeys with or without the define', () {
    expect(DevicePasskeys.offered(TargetPlatform.iOS, onAndroid: false), true);
    expect(DevicePasskeys.offered(TargetPlatform.iOS, onAndroid: true), true);
  });

  test('Android offers passkeys only with the define', () {
    expect(
      DevicePasskeys.offered(TargetPlatform.android, onAndroid: false),
      false,
    );
    expect(
      DevicePasskeys.offered(TargetPlatform.android, onAndroid: true),
      true,
    );
    expect(
      DevicePasskeys.offered(TargetPlatform.macOS, onAndroid: true),
      false,
    );
  });

  test('the define is off unless a build sets it', () {
    expect(EnvConfig.fromDefines().passkeysOnAndroid, false);
  });

  test('an Android build without the define never asks the device', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    expect(await DevicePasskeys().supported(), false);
  });
}
