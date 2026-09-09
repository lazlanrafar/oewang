import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/localization/sync_strings.dart';

/// One status surface shared by all tabs, including accounts and debts.
class SyncStatusBanner extends ConsumerWidget {
  const SyncStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(pendingSyncCountProvider).valueOrNull ?? 0;
    final issues = ref.watch(syncIssuesProvider).valueOrNull ?? [];
    if (count == 0) return const SizedBox.shrink();
    final strings = SyncStrings(Localizations.localeOf(context).languageCode);
    if (issues.isEmpty) {
      return Semantics(
        liveRegion: true,
        child: ListTile(
          dense: true,
          leading: const Icon(Icons.cloud_upload_outlined),
          title: Text(strings.pending(count)),
        ),
      );
    }
    return ExpansionTile(
      leading: const Icon(Icons.sync_problem_outlined),
      title: Text(strings.pending(count)),
      subtitle: Text(strings.failed),
      children: [
        for (final issue in issues)
          ListTile(
            dense: true,
            title: Text(issue.$1),
            subtitle: Text(issue.$2),
          ),
      ],
    );
  }
}
