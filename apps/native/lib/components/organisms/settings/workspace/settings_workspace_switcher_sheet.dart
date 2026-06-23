import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/user_profile.dart';
import 'package:oewang/domain/models/workspace_membership.dart';

typedef WorkspacePicked = Future<void> Function(String workspaceId);

/// Bottom sheet listing the user's workspaces with the active one marked.
/// Picking a different one calls [onPick] (which is responsible for hitting
/// the server + refreshing the JWT) and dismisses.
class WorkspaceSwitcherSheet extends StatelessWidget {
  const WorkspaceSwitcherSheet({
    required this.profile,
    required this.onPick,
    super.key,
  });

  final UserProfile profile;
  final WorkspacePicked onPick;

  static Future<void> show(
    BuildContext context, {
    required UserProfile profile,
    required WorkspacePicked onPick,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.palette.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) =>
          WorkspaceSwitcherSheet(profile: profile, onPick: onPick),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                'Switch workspace',
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                profile.email,
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Divider(height: 1, color: palette.border),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final ws in profile.workspaces)
                    _Row(
                      workspace: ws,
                      isActive: ws.id == profile.activeWorkspaceId,
                      onTap: () async {
                        Navigator.of(context).pop();
                        if (ws.id == profile.activeWorkspaceId) return;
                        await onPick(ws.id);
                      },
                    ),
                ],
              ),
            ),
            Divider(height: 1, color: palette.border),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(
                'Cancel',
                style: OewangFonts.sans(color: palette.foreground),
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
    required this.workspace,
    required this.isActive,
    required this.onTap,
  });

  final WorkspaceMembership workspace;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(Icons.business_outlined, color: palette.foreground, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    workspace.name,
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      workspace.role,
                      if (workspace.planName != null) workspace.planName!,
                    ].join(' · '),
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (isActive)
              const Icon(Icons.check, color: OewangColors.coral, size: 18),
          ],
        ),
      ),
    );
  }
}
