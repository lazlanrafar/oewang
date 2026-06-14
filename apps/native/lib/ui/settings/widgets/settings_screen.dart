import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Placeholder — Settings hub arrives in Milestone 9.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Settings',
        style: OewangFonts.sans(fontSize: 20, fontWeight: FontWeight.w500),
      ),
    );
  }
}
