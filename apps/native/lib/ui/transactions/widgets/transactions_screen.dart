import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Placeholder — full Trans. tab arrives in Milestone 3.
class TransactionsScreen extends StatelessWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Transactions',
        style: OewangFonts.sans(fontSize: 20, fontWeight: FontWeight.w500),
      ),
    );
  }
}
