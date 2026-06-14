import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Placeholder — Accounts tab arrives in Milestone 6.
class WalletsScreen extends StatelessWidget {
  const WalletsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Accounts',
        style: OewangFonts.sans(fontSize: 20, fontWeight: FontWeight.w500),
      ),
    );
  }
}
