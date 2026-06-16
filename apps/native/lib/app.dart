import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/app_theme.dart';

class OewangApp extends ConsumerWidget {
  const OewangApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = ref.watch(transactionColorSchemeProvider);
    final mode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'Oewang',
      theme: AppTheme.light(transactionScheme: scheme),
      darkTheme: AppTheme.dark(transactionScheme: scheme),
      themeMode: mode,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
