import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/section_label.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Settings → Style. Theme (System / Light / Dark, on this device) and the
/// income-expense colours, saved on the user (`PUT /v1/auth/me/colors`).
/// The colour choice is the old transaction settings' row, moved here when
/// that screen went with its API.
class StyleScreen extends ConsumerWidget {
  const StyleScreen({super.key});

  Future<void> _setScheme(
    BuildContext context,
    WidgetRef ref,
    TransactionColorScheme scheme,
  ) async {
    final error = await ref
        .read(transactionColorSchemeProvider.notifier)
        .set(scheme);
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final ctl = ref.read(themeModeProvider.notifier);
    final scheme = ref.watch(transactionColorSchemeProvider);
    return Scaffold(
      appBar: const PageAppBar(title: 'Style', backLabel: 'Settings'),
      body: SafeArea(
        child: ListView(
          children: [
            _Row(
              label: 'System',
              selected: mode == ThemeMode.system,
              onTap: () => unawaited(ctl.set(ThemeMode.system)),
            ),
            _Row(
              label: 'Light',
              selected: mode == ThemeMode.light,
              onTap: () => unawaited(ctl.set(ThemeMode.light)),
            ),
            _Row(
              label: 'Dark',
              selected: mode == ThemeMode.dark,
              onTap: () => unawaited(ctl.set(ThemeMode.dark)),
            ),
            const SectionLabel('Income-Expenses Color Setting'),
            _Row(
              label: 'Income: Blue, Expenses: Red',
              selected: scheme == TransactionColorScheme.blueRed,
              onTap: () => unawaited(
                _setScheme(context, ref, TransactionColorScheme.blueRed),
              ),
            ),
            _Row(
              label: 'Income: Red, Expenses: Blue',
              selected: scheme == TransactionColorScheme.redBlue,
              onTap: () => unawaited(
                _setScheme(context, ref, TransactionColorScheme.redBlue),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Theme.of(context).dividerColor),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: OewangFonts.sans(color: context.palette.foreground),
              ),
            ),
            if (selected)
              const Icon(Icons.check, color: OewangColors.coral, size: 20),
          ],
        ),
      ),
    );
  }
}
