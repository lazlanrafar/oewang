import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/app.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/notifications/push_service.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: kReleaseMode ? '.env.production' : '.env');
  final env = EnvConfig.fromDotEnv();
  final prefs = await PreferencesService.open();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

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
  final sentryEnabled = env.sentryDsn.isNotEmpty && kReleaseMode;
  if (sentryEnabled) {
    await SentryFlutter.init(
      (options) {
        options
          ..dsn = env.sentryDsn
          ..tracesSampleRate = 1.0;
      },
      appRunner: runOewangApp,
    );
  } else {
    await runOewangApp();
  }
}
