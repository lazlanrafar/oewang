import 'dart:convert';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Tagged app logger over `dart:developer`. Mirrors the monorepo's
/// `createLogger("module")` API so logging reads the same across apps.
///
/// In release builds `debug`/`info` are dropped — only `warn`/`error` escalate
/// (e.g. visible in `flutter run --release` / device logs). Never log secrets:
/// JWTs, passwords, encryption keys, or decrypted payloads.
AppLogger createLogger(String name) => AppLogger._(name);

class AppLogger {
  const AppLogger._(this._name);

  final String _name;

  // dart:developer levels follow the `logging` package convention.
  void debug(String message, [Map<String, Object?>? fields]) =>
      _emit(message, 500, fields);

  void info(String message, [Map<String, Object?>? fields]) =>
      _emit(message, 800, fields);

  void warn(String message, [Map<String, Object?>? fields]) =>
      _emit(message, 900, fields);

  void error(
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, Object?>? fields,
  }) => _emit(message, 1000, fields, error, stackTrace);

  void _emit(
    String message,
    int level,
    Map<String, Object?>? fields, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    // ponytail: release drops debug/info; bump to remote sink if we ever ship
    // crash reporting (Sentry etc.).
    if (kReleaseMode && level < 900) return;
    final suffix = (fields == null || fields.isEmpty)
        ? ''
        : ' ${jsonEncode(fields)}';
    developer.log(
      '$message$suffix',
      name: _name,
      level: level,
      error: error,
      stackTrace: stackTrace,
    );
  }
}
