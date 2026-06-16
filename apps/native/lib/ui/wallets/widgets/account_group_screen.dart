import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet_group.dart';

/// IMG_2248 — canonical account-group catalog. Read-only against
/// `walletGroupsRepositoryProvider`.
class AccountGroupScreen extends ConsumerWidget {
  const AccountGroupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_groupsProvider);
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
        title: Text('Account Group', style: OewangFonts.sans(fontSize: 17)),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 4),
            child: Icon(Icons.edit_outlined, color: OewangColors.foreground),
          ),
          Padding(
            padding: EdgeInsets.only(right: 8),
            child: Icon(Icons.add, color: OewangColors.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: async.when(
          data: (groups) => ListView.separated(
            itemCount: groups.length,
            separatorBuilder: (_, _) =>
                const Divider(height: 1, color: OewangColors.border),
            itemBuilder: (context, i) {
              final g = groups[i];
              return Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                child: Text(g.name, style: OewangFonts.sans()),
              );
            },
          ),
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

final _groupsProvider = FutureProvider.autoDispose<List<WalletGroup>>((
  ref,
) async {
  final res = await ref.watch(walletGroupsRepositoryProvider).list();
  return res.fold((g) => g, (_) => const []);
});
