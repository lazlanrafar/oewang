import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/workspace.dart';

final _membersProvider = FutureProvider.autoDispose<List<WorkspaceMember>>((
  ref,
) async {
  ref.watch(
    sessionControllerProvider.select((s) => s.valueOrNull?.workspaceId),
  );
  final res = await ref.watch(workspacesRepositoryProvider).members();
  return res.fold((m) => m, (e) => throw e);
});

/// Settings → Members: who is in the workspace and their role
/// (`GET /v1/workspaces/current/members`). New on mobile, so it borrows the
/// settings list rows; read-only.
// shortcut: no invite, role change or removal here; those stay on the web
// until someone needs them on the phone.
class MembersScreen extends ConsumerWidget {
  const MembersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: const PageAppBar(title: 'Members', backLabel: 'Settings'),
      body: SafeArea(
        child: ref
            .watch(_membersProvider)
            .when(
              data: (members) => ListView(
                children: [for (final m in members) _MemberRow(member: m)],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    e.toString(),
                    textAlign: TextAlign.center,
                    style: OewangFonts.sans(color: OewangColors.coral),
                  ),
                ),
              ),
            ),
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member});
  final WorkspaceMember member;

  static String _role(String role) => switch (role) {
    'owner' => 'Owner',
    'admin' => 'Admin',
    _ => 'Member',
  };

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final name = member.name?.trim() ?? '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isEmpty ? member.email : name,
                  style: OewangFonts.sans(color: palette.foreground),
                ),
                if (name.isNotEmpty)
                  Text(
                    member.email,
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            _role(member.role),
            style: OewangFonts.sans(color: palette.mutedForeground),
          ),
        ],
      ),
    );
  }
}
