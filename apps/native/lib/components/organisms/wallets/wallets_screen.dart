import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/molecules/swipe_action_row.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';

final accountsVmProvider =
    ChangeNotifierProvider.autoDispose<AccountsViewModel>(
      (ref) => AccountsViewModel(
        wallets: ref.watch(walletsRepositoryProvider),
        groups: ref.watch(walletGroupsRepositoryProvider),
      ),
    );

/// IMG_1835 — Accounts tab. The pencil toggles an edit mode where each row
/// gets a delete button, an include-in-totals toggle, and a drag handle.
class WalletsScreen extends ConsumerStatefulWidget {
  const WalletsScreen({super.key});

  @override
  ConsumerState<WalletsScreen> createState() => _WalletsScreenState();
}

class _WalletsScreenState extends ConsumerState<WalletsScreen> {
  bool _editing = false;
  // Which row has its Delete action revealed (only one at a time).
  String? _openId;

  Future<void> _delete(AccountsViewModel vm, Wallet w) async {
    setState(() => _openId = null);
    final err = await vm.deleteWallet(w.id);
    if (err != null && mounted) _snack(err);
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(accountsVmProvider);
    final palette = context.palette;
    ref.listen<int>(walletsRevisionProvider, (_, _) => vm.load());

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              editing: _editing,
              onAdd: () => context.push(AppRoutes.accountForm),
              onToggleEdit: () => setState(() {
                _editing = !_editing;
                _openId = null;
              }),
            ),
            Divider(height: 1, color: palette.border),
            _SummaryRow(
              assets: vm.assets,
              liabilities: vm.liabilities,
              total: vm.total,
            ),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: vm.loading
                  ? const Center(child: CircularProgressIndicator())
                  : vm.error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          vm.error!.message,
                          textAlign: TextAlign.center,
                          style: OewangFonts.sans(color: OewangColors.coral),
                        ),
                      ),
                    )
                  : _AccountsList(
                      sections: vm.sections,
                      editing: _editing,
                      openId: _openId,
                      onToggleOpen: (id) => setState(
                        () => _openId = _openId == id ? null : id,
                      ),
                      onDelete: (w) => _delete(vm, w),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.editing,
    required this.onAdd,
    required this.onToggleEdit,
  });
  final bool editing;
  final VoidCallback onAdd;
  final VoidCallback onToggleEdit;

  @override
  Widget build(BuildContext context) {
    final fg = context.palette.foreground;
    return SizedBox(
      height: 48,
      child: Row(
        children: [
          // Left slot: close (X) while editing, otherwise empty to balance.
          SizedBox(
            width: 48,
            child: editing
                ? IconButton(
                    onPressed: onToggleEdit,
                    icon: Icon(Icons.close, color: fg),
                  )
                : null,
          ),
          const Spacer(),
          Text(
            'Accounts',
            style: OewangFonts.sans(
              color: fg,
              fontSize: 17,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          if (!editing)
            IconButton(
              onPressed: onToggleEdit,
              icon: Icon(Icons.edit_outlined, color: fg),
            ),
          IconButton(onPressed: onAdd, icon: Icon(Icons.add, color: fg)),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.assets,
    required this.liabilities,
    required this.total,
  });

  final Money assets;
  final Money liabilities;
  final Money total;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: _Cell(label: 'Assets', value: assets, color: tx.income),
          ),
          Expanded(
            child: _Cell(
              label: 'Liabilities',
              value: liabilities,
              color: tx.expense,
            ),
          ),
          Expanded(
            child: _Cell(label: 'Total', value: total, color: palette.foreground),
          ),
        ],
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.label, required this.value, required this.color});
  final String label;
  final Money value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: OewangFonts.sans(
            color: context.palette.mutedForeground,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 2),
        MoneyText(amount: value, color: color),
      ],
    );
  }
}

class _AccountsList extends StatelessWidget {
  const _AccountsList({
    required this.sections,
    required this.editing,
    required this.openId,
    required this.onToggleOpen,
    required this.onDelete,
  });

  final List<AccountGroupSection> sections;
  final bool editing;
  final String? openId;
  final ValueChanged<String> onToggleOpen;
  final ValueChanged<Wallet> onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (sections.isEmpty) {
      return Center(
        child: Text(
          'No accounts yet',
          style: OewangFonts.sans(color: palette.mutedForeground),
        ),
      );
    }

    return ListView.builder(
      itemCount: sections.length,
      itemBuilder: (context, index) {
        final s = sections[index];
        return Column(
          children: [
            _GroupHeader(name: s.group.name, subtotal: s.subtotal),
            Divider(height: 1, color: palette.border),
            for (final w in s.wallets)
              if (editing)
                SwipeActionRow(
                  key: ValueKey(w.id),
                  title: w.name,
                  isOpen: openId == w.id,
                  onToggleOpen: () => onToggleOpen(w.id),
                  onDelete: () => onDelete(w),
                )
              else ...[
                ListTile(
                  onTap: () =>
                      context.push(AppRoutes.accountEditFor(w.id), extra: w),
                  title: Text(
                    w.name,
                    style: OewangFonts.sans(color: palette.foreground),
                  ),
                  trailing: MoneyText(
                    amount: Money(amount: w.balance, currency: w.currency),
                    color: palette.foreground,
                  ),
                  dense: true,
                ),
                Divider(height: 1, color: palette.border),
              ],
          ],
        );
      },
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.name, required this.subtotal});
  final String name;
  final Money subtotal;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      color: palette.muted,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              name,
              style: OewangFonts.sans(
                color: palette.mutedForeground,
                fontSize: 12,
              ),
            ),
          ),
          MoneyText(
            amount: subtotal,
            color: palette.mutedForeground,
            fontSize: 13,
          ),
        ],
      ),
    );
  }
}
