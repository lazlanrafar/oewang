import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/core/page_app_bar.dart';

/// Settings → Style. Three options: System / Light / Dark.
class StyleScreen extends ConsumerWidget {
  const StyleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final ctl = ref.read(themeModeProvider.notifier);
    return Scaffold(
      appBar: const PageAppBar(
        title: 'Style',
        backLabel: 'Settings',
      ),
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
            Expanded(child: Text(label, style: OewangFonts.sans())),
            if (selected)
              const Icon(Icons.check, color: OewangColors.coral, size: 20),
          ],
        ),
      ),
    );
  }
}
