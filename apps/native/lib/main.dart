import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/app.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load();
  final env = EnvConfig.fromDotEnv();
  final prefs = await PreferencesService.open();
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
