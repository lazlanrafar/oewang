import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class _GroupsRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final _groupsRevisionProvider =
    NotifierProvider<_GroupsRevision, int>(_GroupsRevision.new);

final _groupsProvider = FutureProvider.autoDispose<List<WalletGroup>>((
  ref,
) async {
  ref.watch(_groupsRevisionProvider);
  final res = await ref.watch(walletGroupsRepositoryProvider).list();
  return res.fold((g) => g, (_) => const []);
});

/// IMG_2248 — account-group catalog. Delete / edit / drag-to-reorder,
/// mirroring the category settings list.
class AccountGroupScreen extends ConsumerStatefulWidget {
  const AccountGroupScreen({super.key});

  @override
  ConsumerState<AccountGroupScreen> createState() => _AccountGroupScreenState();
}

class _AccountGroupScreenState extends ConsumerState<AccountGroupScreen> {
  // Local copy so drag-reorder updates instantly; synced from the provider.
  List<WalletGroup> _items = [];
  // Which row has its Delete action revealed (only one at a time).
  String? _openId;

  void _bump() => ref.read(_groupsRevisionProvider.notifier).bump();

  Future<void> _add() async {
    final saved = await context.push<bool>(AppRoutes.accountGroupAdd);
    if ((saved ?? false) && mounted) _bump();
  }

  Future<void> _edit(WalletGroup g) async {
    setState(() => _openId = null);
    final saved = await context.push<bool>(
      AppRoutes.accountGroupEditFor(g.id),
      extra: g,
    );
    if ((saved ?? false) && mounted) _bump();
  }

  Future<void> _delete(WalletGroup g) async {
    setState(() => _openId = null);
    final res = await ref.read(walletGroupsRepositoryProvider).delete(g.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) => _snack(e.message));
  }

  Future<void> _reorder(int oldIndex, int newIndex) async {
    setState(() {
      final target = newIndex > oldIndex ? newIndex - 1 : newIndex;
      final moved = _items.removeAt(oldIndex);
      _items.insert(target, moved);
    });
    final res = await ref
        .read(walletGroupsRepositoryProvider)
        .reorder(_items.map((g) => g.id).toList());
    if (!mounted) return;
    res.fold((_) {}, (e) {
      _snack(e.message);
      _bump(); // reload to undo the optimistic move
    });
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_groupsProvider);
    // Keep the local list in sync whenever the provider re-fetches.
    ref.listen(_groupsProvider, (_, next) {
      final data = next.valueOrNull;
      if (data != null) setState(() => _items = List.of(data));
    });
    final palette = context.palette;
    return Scaffold(
      appBar: PageAppBar(
        title: 'Account Group',
        backLabel: 'Accounts',
        actions: [
          IconButton(
            onPressed: _add,
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: async.when(
          data: (items) {
            final list = _items.isEmpty ? items : _items;
            return ReorderableListView.builder(
              itemCount: list.length,
              onReorder: _reorder,
              itemBuilder: (context, i) => _GroupRow(
                key: ValueKey(list[i].id),
                index: i,
                group: list[i],
                isOpen: _openId == list[i].id,
                onToggleOpen: () => setState(
                  () => _openId = _openId == list[i].id ? null : list[i].id,
                ),
                onDelete: () => _delete(list[i]),
                onEdit: () => _edit(list[i]),
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text(
              e.toString(),
              style: OewangFonts.sans(color: OewangColors.coral),
            ),
          ),
        ),
      ),
    );
  }
}

// Width of the revealed Delete action (also how far the row slides left).
const double _kDeleteWidth = 96;
const double _kRowHeight = 56;

class _GroupRow extends StatelessWidget {
  const _GroupRow({
    required this.index,
    required this.group,
    required this.isOpen,
    required this.onToggleOpen,
    required this.onEdit,
    required this.onDelete,
    super.key,
  });
  final int index;
  final WalletGroup group;
  final bool isOpen;
  final VoidCallback onToggleOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: _kRowHeight,
      child: Stack(
        children: [
          // Delete action behind, pinned to the right edge.
          Positioned(
            top: 0,
            bottom: 0,
            right: 0,
            width: _kDeleteWidth,
            child: GestureDetector(
              onTap: onDelete,
              child: ColoredBox(
                color: OewangColors.coral,
                child: Center(
                  child: Text(
                    'Delete',
                    style: OewangFonts.sans(color: Colors.white, fontSize: 15),
                  ),
                ),
              ),
            ),
          ),
          // Foreground row — slides left to reveal the Delete action.
          AnimatedPositioned(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            top: 0,
            bottom: 0,
            left: isOpen ? -_kDeleteWidth : 0,
            right: isOpen ? _kDeleteWidth : 0,
            // Tapping the row body (anywhere but the action buttons) while the
            // Delete action is revealed cancels it.
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: isOpen ? onToggleOpen : null,
              child: DecoratedBox(
              decoration: BoxDecoration(
                color: palette.background,
                border: Border(bottom: BorderSide(color: palette.border)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Delete',
                      onPressed: onToggleOpen,
                      icon: const Icon(
                        Icons.remove_circle,
                        color: OewangColors.coral,
                        size: 18,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        group.name,
                        style: OewangFonts.sans(color: palette.foreground),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Edit',
                      onPressed: onEdit,
                      icon: Icon(Icons.edit_outlined,
                          color: palette.mutedForeground),
                    ),
                    ReorderableDragStartListener(
                      index: index,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Icon(Icons.drag_handle,
                            color: palette.mutedForeground),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            ),
          ),
        ],
      ),
    );
  }
}
