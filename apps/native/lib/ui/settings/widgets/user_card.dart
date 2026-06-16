import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/user_profile.dart';
import 'package:oewang/ui/settings/widgets/workspace_switcher_sheet.dart';

/// FutureProvider keyed on the session so a relogin re-fetches the profile.
final userProfileProvider = FutureProvider.autoDispose<UserProfile?>((
  ref,
) async {
  // Rebuild when a refresh happens (workspace switched + JWT re-issued).
  ref.watch(sessionControllerProvider);
  final session = ref.read(sessionControllerProvider).valueOrNull;
  if (session == null) return null;
  final res = await ref.read(usersRepositoryProvider).getProfile();
  return res.fold((ok) => ok, (_) => null);
});

/// Top-of-Settings user card. Tap to open the workspace switcher.
class UserCard extends ConsumerWidget {
  const UserCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    final async = ref.watch(userProfileProvider);

    return async.when(
      data: (profile) {
        if (profile == null) return const _UserCardSkeleton();
        return _Card(profile: profile, palette: palette);
      },
      loading: () => const _UserCardSkeleton(),
      error: (_, _) => const _UserCardSkeleton(),
    );
  }
}

class _Card extends ConsumerWidget {
  const _Card({required this.profile, required this.palette});

  final UserProfile profile;
  final OewangPalette palette;

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
        // Invalidate the profile + any data scoped to the workspace.
        ref
          ..invalidate(userProfileProvider)
          ..read(transactionsRevisionProvider.notifier).bump()
          ..read(walletsRevisionProvider.notifier).bump();
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeWorkspace = profile.activeWorkspace;
    return InkWell(
      onTap: () => _openSwitcher(context, ref),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.border),
          borderRadius: BorderRadius.circular(OewangRadius.lg),
        ),
        child: Row(
          children: [
            _Avatar(profile: profile, palette: palette),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile.displayName,
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    profile.email,
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.business_outlined,
                        size: 14,
                        color: palette.mutedForeground,
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          activeWorkspace?.name ?? 'No active workspace',
                          style: OewangFonts.sans(
                            color: palette.foreground,
                            fontSize: 13,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
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

class _Avatar extends StatelessWidget {
  const _Avatar({required this.profile, required this.palette});

  final UserProfile profile;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    final initial = profile.displayName.isNotEmpty
        ? profile.displayName[0].toUpperCase()
        : '?';
    final fallback = Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: palette.muted,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: OewangFonts.sans(
          color: palette.foreground,
          fontSize: 18,
          fontWeight: FontWeight.w500,
        ),
      ),
    );

    final url = profile.profilePicture;
    if (url == null || url.isEmpty) return fallback;
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: url,
        width: 48,
        height: 48,
        fit: BoxFit.cover,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      ),
    );
  }
}

class _UserCardSkeleton extends StatelessWidget {
  const _UserCardSkeleton();
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(OewangRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: palette.muted,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 12, width: 120, color: palette.muted),
                const SizedBox(height: 6),
                Container(height: 10, width: 80, color: palette.muted),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
