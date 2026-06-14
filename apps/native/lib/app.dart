import 'package:flutter/material.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/ui/shell/smoke_screen.dart';

class OewangApp extends StatelessWidget {
  const OewangApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Oewang',
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
      home: const SmokeScreen(),
    );
  }
}
