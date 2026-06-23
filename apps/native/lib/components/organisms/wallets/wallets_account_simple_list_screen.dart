import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/molecules/swipe_action_row.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class _AccountsRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final _accountsRevisionProvider =
    NotifierProvider<_AccountsRevision, int>(_AccountsRevision.new);

final _groupsProvider = FutureProvider.autoDispose<List<WalletGroup>>((
  ref,
) async {
  ref.watch(_accountsRevisionProvider);
  final res = await ref.watch(walletGroupsRepositoryProvider).list();
  return res.fold((g) => g, (_) => const []);
});

final _walletsProvider = FutureProvider.autoDispose<List<Wallet>>((ref) async {
  ref.watch(_accountsRevisionProvider);
  final res = await ref.watch(walletsRepositoryProvider).list();
  return res.fold((w) => w, (_) => const []);
});

/// IMG_2249 — accounts grouped by their group, with delete / edit CRUD.
/// Empty groups are hidden; no drag-reorder here.
class AccountSimpleListScreen extends ConsumerStatefulWidget {
  const AccountSimpleListScreen({super.key});

  @override
  ConsumerState<AccountSimpleListScreen> createState() =>
      _AccountSimpleListScreenState();
}

class _AccountSimpleListScreenState
    extends ConsumerState<AccountSimpleListScreen> {
  // Which row has its Delete action revealed (only one at a time).
  String? _openId;

  void _bump() => ref.read(_accountsRevisionProvider.notifier).bump();

  Future<void> _add() async {
    final saved = await context.push<bool>(AppRoutes.accountForm);
    if ((saved ?? false) && mounted) _bump();
  }

  Future<void> _edit(Wallet w) async {
    setState(() => _openId = null);
    final saved = await context.push<bool>(
      AppRoutes.accountEditFor(w.id),
      extra: w,
    );
    if ((saved ?? false) && mounted) _bump();
  }

  Future<void> _delete(Wallet w) async {
    setState(() => _openId = null);
    final res = await ref.read(walletsRepositoryProvider).delete(w.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    });
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(_groupsProvider);
    final walletsAsync = ref.watch(_walletsProvider);
    final palette = context.palette;

    return Scaffold(
      appBar: PageAppBar(
        title: 'Accounts',
        backLabel: 'Accounts',
        actions: [
          IconButton(
            onPressed: _add,
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: groupsAsync.when(
          data: (groups) => walletsAsync.when(
            data: (wallets) => _buildList(groups, wallets),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: _error,
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: _error,
        ),
      ),
    );
  }

  Widget _buildList(List<WalletGroup> groups, List<Wallet> wallets) {
    final byGroup = <String?, List<Wallet>>{};
    for (final w in wallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }
    Widget rowFor(Wallet w) => SwipeActionRow(
      key: ValueKey(w.id),
      title: w.name,
      isOpen: _openId == w.id,
      onToggleOpen: () =>
          setState(() => _openId = _openId == w.id ? null : w.id),
      onDelete: () => _delete(w),
      onEdit: () => _edit(w),
    );
    return ListView(
      children: [
        // Only render a group header when it actually has accounts.
        for (final g in groups)
          if ((byGroup[g.id] ?? const []).isNotEmpty) ...[
            _GroupHeader(name: g.name),
            for (final w in byGroup[g.id]!) rowFor(w),
          ],
        if ((byGroup[null] ?? const []).isNotEmpty) ...[
          const _GroupHeader(name: 'Others'),
          for (final w in byGroup[null]!) rowFor(w),
        ],
      ],
    );
  }

  Widget _error(Object e, StackTrace? _) => Center(
    child: Text(
      e.toString(),
      style: OewangFonts.sans(color: OewangColors.coral),
    ),
  );
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      color: palette.muted,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        name,
        style: OewangFonts.sans(
          color: palette.mutedForeground,
          fontSize: 12,
        ),
      ),
    );
  }
}
