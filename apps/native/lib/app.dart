import 'package:flutter/material.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/app_theme.dart';

class OewangApp extends StatefulWidget {
  const OewangApp({super.key});

  @override
  State<OewangApp> createState() => _OewangAppState();
}

class _OewangAppState extends State<OewangApp> {
  late final _router = buildAppRouter();

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Oewang',
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
    );
  }
}
