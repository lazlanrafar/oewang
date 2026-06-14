import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/app.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/config/env.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load();
  final env = EnvConfig.fromDotEnv();
  runApp(
    ProviderScope(
      overrides: [envProvider.overrideWithValue(env)],
      child: const OewangApp(),
    ),
  );
}
