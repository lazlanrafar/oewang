import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/app.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final env = EnvConfig.fromDefines();
  final prefs = await PreferencesService.open();

  Future<void> runOewangApp() async {
    runApp(
      ProviderScope(
        overrides: [
          envProvider.overrideWithValue(env),
          preferencesServiceProvider.overrideWithValue(prefs),
        ],
        child: const OewangApp(),
      ),
    );
  }

  // Sentry no-ops on an empty DSN but has no notion of Flutter debug/release
  // mode on its own, so debug builds are excluded explicitly here.
  if (env.sentryDsn.isNotEmpty && kReleaseMode) {
    await SentryFlutter.init((options) {
      options
        ..dsn = env.sentryDsn
        ..tracesSampleRate = 1.0
        // Never a body, a header or a token (OPS-3): Dio is not hooked into
        // Sentry, and default PII (IP, user) is off.
        ..sendDefaultPii = false
        ..maxRequestBodySize = MaxRequestBodySize.never
        ..beforeBreadcrumb = _stripHttpBreadcrumb;
    }, appRunner: runOewangApp);
  } else {
    await runOewangApp();
  }
}

/// An HTTP breadcrumb carries the URL; keep method and status, drop the rest.
Breadcrumb? _stripHttpBreadcrumb(Breadcrumb? crumb, Hint hint) {
  if (crumb == null || crumb.type != 'http') return crumb;
  final data = crumb.data ?? const <String, dynamic>{};
  // Sentry 9 made Breadcrumb mutable and dropped copyWith.
  return crumb
    ..data = {
      if (data['method'] != null) 'method': data['method'],
      if (data['status_code'] != null) 'status_code': data['status_code'],
    };
}
