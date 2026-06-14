import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Placeholder — Stats tab arrives in Milestone 8.
class StatsScreen extends StatelessWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Stats',
        style: OewangFonts.sans(fontSize: 20, fontWeight: FontWeight.w500),
      ),
    );
  }
}
