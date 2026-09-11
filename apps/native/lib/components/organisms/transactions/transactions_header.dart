import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/molecules/sync_status_banner.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Top chrome of the Trans. tab: search · "Trans." · sync status.
class TransactionsHeader extends StatelessWidget {
  const TransactionsHeader({this.onSearchTap, super.key});

  final VoidCallback? onSearchTap;

  @override
  Widget build(BuildContext context) {
    final fg = context.palette.foreground;
    return SizedBox(
      height: 48,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Search',
            onPressed: onSearchTap,
            icon: Icon(Icons.search, color: fg),
          ),
          Expanded(
            child: Center(
              child: Text(
                'Trans.',
                style: OewangFonts.sans(
                  color: fg,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          const _SyncStatusButton(),
        ],
      ),
    );
  }
}

/// Compact replacement for the old full-width sync banner: a small icon that
/// only appears when there's something to report, with a badge for the
/// pending count. Tap opens the detail list in a bottom sheet. Balances the
/// leading search button (same width) whether shown or not, so the title
/// stays centered either way.
class _SyncStatusButton extends ConsumerWidget {
  const _SyncStatusButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(pendingSyncCountProvider).valueOrNull ?? 0;
    if (count == 0) return const SizedBox(width: 48);

    final issues = ref.watch(syncIssuesProvider).valueOrNull ?? [];
    final hasIssues = issues.isNotEmpty;
    final palette = context.palette;
    final color = hasIssues ? OewangColors.coral : palette.foreground;

    return SizedBox(
      width: 48,
      child: IconButton(
        tooltip: hasIssues ? 'Sync issues' : 'Changes waiting to sync',
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          builder: (_) => const SafeArea(child: SyncStatusBanner()),
        ),
        icon: Badge(
          label: Text('$count'),
          backgroundColor: color,
          child: Icon(
            hasIssues ? Icons.sync_problem_outlined : Icons.cloud_upload_outlined,
            color: color,
          ),
        ),
      ),
    );
  }
}
