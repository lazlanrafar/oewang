import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Host side of `flutter drive`: writes each screenshot the test takes.
Future<void> main() => integrationDriver(
  onScreenshot: (name, bytes, [args]) async {
    final dir =
        Platform.environment['SCREENSHOT_DIR'] ??
        'build/integration_screenshots';
    File('$dir/$name.png')
      ..createSync(recursive: true)
      ..writeAsBytesSync(bytes);
    return true;
  },
);
