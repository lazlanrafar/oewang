import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/user_profile.dart';
import 'package:oewang/ui/settings/widgets/user_profile_header.dart';
import 'package:oewang/ui/settings/widgets/workspace_switcher_sheet.dart';

/// Dedicated workspace card. Sits right under the [UserCard] in Settings.
/// Tap to open the workspace switcher sheet.
class WorkspaceCard extends ConsumerWidget {
  const WorkspaceCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(userProfileProvider);
    return async.when(
      data: (profile) {
        if (profile == null || profile.workspaces.isEmpty) {
          return const _WorkspaceSkeleton();
        }
        return _Card(profile: profile);
      },
      loading: () => const _WorkspaceSkeleton(),
      error: (_, _) => const _WorkspaceSkeleton(),
    );
  }
}

class _Card extends ConsumerWidget {
  const _Card({required this.profile});
  final UserProfile profile;

  Future<void> _openSwitcher(BuildContext context, WidgetRef ref) async {
    await WorkspaceSwitcherSheet.show(
      context,
      profile: profile,
      onPick: (id) async {
        final users = ref.read(usersRepositoryProvider);
        final auth = ref.read(authRepositoryProvider);
        final res = await users.switchWorkspace(id);
        if (res.isErr) {
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not switch workspace')),
          );
          return;
        }
        // Mint a JWT that carries the new workspace_id.
        await auth.refreshToken();
        // Invalidate profile + data scoped to the workspace so every tab
        // re-fetches against the newly active workspace.
        ref
          ..invalidate(userProfileProvider)
          ..read(transactionsRevisionProvider.notifier).bump()
          ..read(walletsRevisionProvider.notifier).bump();
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    final ws = profile.activeWorkspace;
    final subtitle = ws == null
        ? '${profile.workspaces.length} workspaces'
        : [
            ws.role,
            if (ws.planName != null) ws.planName!,
          ].join(' · ');
    return InkWell(
      onTap: () => _openSwitcher(context, ref),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: palette.border),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: palette.muted,
                shape: BoxShape.rectangle,
              ),
              alignment: Alignment.center,
              child: Icon(
                Icons.business_outlined,
                color: palette.foreground,
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Workspace',
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    ws?.name ?? 'No active workspace',
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    subtitle,
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.unfold_more,
              color: palette.mutedForeground,
              size: 18,
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceSkeleton extends StatelessWidget {
  const _WorkspaceSkeleton();
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Container(width: 36, height: 36, color: palette.muted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 10, width: 60, color: palette.muted),
                const SizedBox(height: 6),
                Container(height: 14, width: 140, color: palette.muted),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
