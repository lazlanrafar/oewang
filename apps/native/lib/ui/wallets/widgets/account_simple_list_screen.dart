import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

/// IMG_2249 — accounts grouped by their group, names only.
class AccountSimpleListScreen extends ConsumerWidget {
  const AccountSimpleListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupsAsync = ref.watch(_groupsProvider);
    final walletsAsync = ref.watch(_walletsProvider);
    final palette = context.palette;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Accounts'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text('Accounts', style: OewangFonts.sans(fontSize: 17)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Icon(Icons.edit_outlined, color: palette.foreground),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: groupsAsync.when(
          data: (groups) => walletsAsync.when(
            data: (wallets) => _List(groups: groups, wallets: wallets),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: _Error.new,
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: _Error.new,
        ),
      ),
    );
  }
}

final _groupsProvider = FutureProvider.autoDispose<List<WalletGroup>>((
  ref,
) async {
  final res = await ref.watch(walletGroupsRepositoryProvider).list();
  return res.fold((g) => g, (_) => const []);
});

final _walletsProvider = FutureProvider.autoDispose<List<Wallet>>((ref) async {
  final res = await ref.watch(walletsRepositoryProvider).list();
  return res.fold((w) => w, (_) => const []);
});

class _List extends StatelessWidget {
  const _List({required this.groups, required this.wallets});
  final List<WalletGroup> groups;
  final List<Wallet> wallets;

  @override
  Widget build(BuildContext context) {
    final byGroup = <String?, List<Wallet>>{};
    for (final w in wallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }
    return ListView(
      children: [
        for (final g in groups) ...[
          _GroupHeader(name: g.name),
          for (final w in byGroup[g.id] ?? const <Wallet>[]) _WalletRow(w: w),
        ],
        if ((byGroup[null] ?? const []).isNotEmpty) ...[
          const _GroupHeader(name: 'Others'),
          for (final w in byGroup[null]!) _WalletRow(w: w),
        ],
      ],
    );
  }
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

class _WalletRow extends StatelessWidget {
  const _WalletRow({required this.w});
  final Wallet w;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    child: Text(
      w.name,
      style: OewangFonts.sans(color: context.palette.foreground),
    ),
  );
}

class _Error extends StatelessWidget {
  const _Error(this.error, this.stack);
  final Object error;
  final StackTrace? stack;
  @override
  Widget build(BuildContext context) => Center(
    child: Text(
      error.toString(),
      style: OewangFonts.sans(color: OewangColors.coral),
    ),
  );
}
