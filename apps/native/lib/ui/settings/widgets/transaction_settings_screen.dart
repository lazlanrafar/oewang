import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// IMG_1848. Most rows are static placeholders until their underlying setting
/// endpoint is wired; the Income-Expenses Color row is live.
class TransactionSettingsScreen extends ConsumerWidget {
  const TransactionSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = ref.watch(transactionColorSchemeProvider);
    final ctl = ref.read(transactionColorSchemeProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Settings'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text(
          'Transaction Settings',
          style: OewangFonts.sans(fontSize: 17),
        ),
      ),
      body: SafeArea(
        child: ListView(
          children: [
            const _StaticRow(label: 'Monthly Start Date', value: '1'),
            const _StaticRow(label: 'Weekly Start Day', value: 'Sunday'),
            const _StaticRow(label: 'Carry-over Setting', value: 'Off'),
            const _StaticRow(label: 'Period Setting', value: 'Monthly'),
            InkWell(
              onTap: () async {
                final next = scheme == TransactionColorScheme.blueRed
                    ? TransactionColorScheme.redBlue
                    : TransactionColorScheme.blueRed;
                await ctl.set(next);
              },
              child: _Row(
                label: 'Income-Expenses Color Setting',
                trailing: Text(
                  scheme == TransactionColorScheme.blueRed
                      ? 'Income blue / Exp. red'
                      : 'Income red / Exp. blue',
                  style: OewangFonts.sans(color: OewangColors.coral),
                ),
              ),
            ),
            const _StaticRow(label: 'Autocomplete', value: 'On'),
            const _StaticRow(label: 'Time Input', value: 'None, Desc.'),
            const _StaticRow(label: 'Start Screen (Daily/Calendar)', value: 'Daily'),
            const _StaticRow(label: 'Swipe', value: 'To Change Date'),
            const _StaticRow(label: 'Show description', value: 'Off'),
            const _StaticRow(label: 'Input order', value: 'From Amount'),
            const _StaticRow(label: 'Note button setting', value: 'Off'),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, this.trailing});
  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: OewangColors.border)),
      ),
      child: Row(
        children: [
          Expanded(child: Text(label, style: OewangFonts.sans())),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _StaticRow extends StatelessWidget {
  const _StaticRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return _Row(
      label: label,
      trailing: Text(
        value,
        style: OewangFonts.sans(color: OewangColors.coral),
      ),
    );
  }
}
