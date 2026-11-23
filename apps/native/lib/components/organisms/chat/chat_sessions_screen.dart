import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/molecules/rename_dialog.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/chat.dart';

/// Every conversation, newest activity first. Rename and delete are on a
/// long press; delete asks first (UI-4).
final chatSessionsProvider =
    FutureProvider.autoDispose<List<ChatSessionSummary>>((ref) async {
      final res = await ref.watch(chatRepositoryProvider).listSessions();
      return switch (res) {
        Success(:final value) => value,
        Failure(:final error) => throw error,
      };
    });

class ChatSessionsScreen extends ConsumerWidget {
  const ChatSessionsScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, String path) async {
    await context.push(path);
    ref.invalidate(chatSessionsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(chatSessionsProvider);
    final palette = context.palette;
    final muted = OewangFonts.sans(
      color: palette.mutedForeground,
      fontSize: 13,
    );

    return Scaffold(
      appBar: PageAppBar(
        title: 'Chats',
        actions: [
          IconButton(
            tooltip: 'New chat',
            onPressed: () => _open(context, ref, AppRoutes.chatNew),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: sessions.when(
        loading: () =>
            const Center(child: CircularProgressIndicator.adaptive()),
        error: (e, _) => Center(child: Text('$e', style: muted)),
        data: (list) => list.isEmpty
            ? Center(
                child: Text('No chats yet. Start one with +.', style: muted),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(chatSessionsProvider.future),
                child: ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, color: palette.border),
                  itemBuilder: (_, i) {
                    final s = list[i];
                    return ListTile(
                      title: Text(
                        s.title.isEmpty ? 'New chat' : s.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: s.lastMessage == null
                          ? null
                          : Text(
                              s.lastMessage!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: muted,
                            ),
                      trailing: Text(
                        DateFormat('d MMM').format(s.updatedAt.toLocal()),
                        style: muted,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: OewangSpacing.lg,
                      ),
                      onTap: () => _open(context, ref, AppRoutes.chatFor(s.id)),
                      onLongPress: () => _actions(context, ref, s),
                    );
                  },
                ),
              ),
      ),
    );
  }

  Future<void> _actions(
    BuildContext context,
    WidgetRef ref,
    ChatSessionSummary s,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Rename'),
              onTap: () => Navigator.of(ctx).pop('rename'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Delete'),
              onTap: () => Navigator.of(ctx).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    final repo = ref.read(chatRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);

    final Result<void, Object> res;
    if (action == 'rename') {
      final title = await showRenameDialog(context, s.title);
      if (title == null) return;
      res = await repo.rename(s.id, title);
    } else {
      final ok = await showConfirmDialog(
        context,
        title: 'Delete chat?',
        message: '"${s.title}" and its messages will be removed.',
      );
      if (!ok) return;
      res = await repo.delete(s.id);
    }
    if (res case Failure(:final error)) {
      messenger.showSnackBar(SnackBar(content: Text('$error')));
    }
    ref.invalidate(chatSessionsProvider);
  }
}
