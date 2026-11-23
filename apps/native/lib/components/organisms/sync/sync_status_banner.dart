import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/organisms/sync/sync_issues_sheet.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

String _changes(int n) => '$n change${n == 1 ? '' : 's'}';

/// One status line for the offline queue, shared by every tab (MOB-6): offline,
/// syncing, and the writes that need the person. Tapping it when something
/// was refused or is in conflict opens [SyncIssuesSheet] (MOB-7).
class SyncStatusBanner extends ConsumerWidget {
  const SyncStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncStatusProvider);
    if (s.isIdle) return const SizedBox.shrink();
    final palette = context.palette;
    final issues = s.failed + s.conflicts;
    final title = switch ((s.online, s.pending)) {
      (false, 0) => 'Offline',
      (false, final n) => 'Offline, ${_changes(n)} saved on this device',
      (true, 0) => 'Some changes need you',
      (true, final n) => 'Syncing ${_changes(n)}',
    };
    final subtitle = [
      if (s.conflicts > 0) '${s.conflicts} changed elsewhere',
      if (s.failed > 0) '${s.failed} refused',
    ].join(', ');

    return Semantics(
      liveRegion: true,
      child: Material(
        color: palette.background,
        child: ListTile(
          dense: true,
          leading: Icon(
            issues > 0
                ? Icons.sync_problem_outlined
                : s.online
                ? Icons.cloud_upload_outlined
                : Icons.cloud_off_outlined,
            color: palette.mutedForeground,
          ),
          title: Text(
            title,
            style: OewangFonts.sans(color: palette.foreground),
          ),
          subtitle: issues == 0
              ? null
              : Text(
                  '$subtitle. Tap to review',
                  style: OewangFonts.sans(color: palette.mutedForeground),
                ),
          onTap: issues == 0 ? null : () => SyncIssuesSheet.show(context),
        ),
      ),
    );
  }
}
