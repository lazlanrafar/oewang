import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/app_theme.dart';

class OewangApp extends ConsumerWidget {
  const OewangApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Oewang',
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
