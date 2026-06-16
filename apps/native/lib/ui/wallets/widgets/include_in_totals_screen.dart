import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';
import 'package:oewang/ui/core/money_text.dart';

/// IMG_2250 — checkbox-driven Include-in-Totals editor. Selection is local;
/// persistence lands when the wallet settings endpoint is wired.
class IncludeInTotalsScreen extends ConsumerStatefulWidget {
  const IncludeInTotalsScreen({super.key});

  @override
  ConsumerState<IncludeInTotalsScreen> createState() =>
      _IncludeInTotalsScreenState();
}

class _IncludeInTotalsScreenState extends ConsumerState<IncludeInTotalsScreen> {
  final Set<String> _excluded = <String>{};

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(_groupsProvider);
    final walletsAsync = ref.watch(_walletsProvider);
    final tx = Theme.of(context).extension<TransactionColors>()!;

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
        title: Text(
          'Include in totals',
          style: OewangFonts.sans(fontSize: 17),
        ),
      ),
      body: SafeArea(
        child: groupsAsync.when(
          data: (groups) => walletsAsync.when(
            data: (wallets) => _Body(
              groups: groups,
              wallets: wallets,
              excluded: _excluded,
              onToggle: (id) => setState(() {
                if (_excluded.contains(id)) {
                  _excluded.remove(id);
                } else {
                  _excluded.add(id);
                }
              }),
              tx: tx,
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(e.toString())),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text(e.toString())),
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

class _Body extends StatelessWidget {
  const _Body({
    required this.groups,
    required this.wallets,
    required this.excluded,
    required this.onToggle,
    required this.tx,
  });

  final List<WalletGroup> groups;
  final List<Wallet> wallets;
  final Set<String> excluded;
  final ValueChanged<String> onToggle;
  final TransactionColors tx;

  @override
  Widget build(BuildContext context) {
    final included = wallets.where((w) => !excluded.contains(w.id)).toList();
    var assets = Money.zero();
    var liabilities = Money.zero();
    for (final w in included) {
      if (w.balance >= 0) {
        assets += Money(amount: w.balance, currency: w.currency);
      } else {
        liabilities += Money(amount: -w.balance, currency: w.currency);
      }
    }
    final byGroup = <String?, List<Wallet>>{};
    for (final w in wallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }
    return Column(
      children: [
        _SummaryRow(
          assets: assets,
          liabilities: liabilities,
          tx: tx,
        ),
        const Divider(height: 1, color: OewangColors.border),
        Expanded(
          child: ListView(
            children: [
              for (final g in groups) ...[
                _GroupHeader(
                  name: g.name,
                  subtotal: _subtotal(byGroup[g.id] ?? const [], excluded),
                ),
                for (final w in byGroup[g.id] ?? const <Wallet>[])
                  _Row(
                    wallet: w,
                    excluded: excluded.contains(w.id),
                    onToggle: () => onToggle(w.id),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Money _subtotal(List<Wallet> ws, Set<String> excluded) {
    var total = Money.zero();
    for (final w in ws) {
      if (excluded.contains(w.id)) continue;
      total += Money(amount: w.balance, currency: w.currency);
    }
    return total;
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.assets,
    required this.liabilities,
    required this.tx,
  });

  final Money assets;
  final Money liabilities;
  final TransactionColors tx;

  @override
  Widget build(BuildContext context) {
    final total = Money(amount: assets.amount - liabilities.amount);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(child: _Cell(label: 'Account', value: assets, color: tx.income)),
          Expanded(
            child: _Cell(
              label: 'Liabilities',
              value: liabilities,
              color: tx.expense,
            ),
          ),
          Expanded(
            child: _Cell(
              label: 'Total',
              value: total,
              color: OewangColors.foreground,
            ),
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
  Widget build(BuildContext context) => Column(
    children: [
      Text(
        label,
        style: OewangFonts.sans(
          color: OewangColors.mutedForeground,
          fontSize: 12,
        ),
      ),
      const SizedBox(height: 2),
      MoneyText(amount: value, color: color),
    ],
  );
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.name, required this.subtotal});
  final String name;
  final Money subtotal;
  @override
  Widget build(BuildContext context) => Container(
    color: OewangColors.muted,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            name,
            style: OewangFonts.sans(
              color: OewangColors.mutedForeground,
              fontSize: 12,
            ),
          ),
        ),
        MoneyText(
          amount: subtotal,
          color: OewangColors.mutedForeground,
          fontSize: 13,
        ),
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({
    required this.wallet,
    required this.excluded,
    required this.onToggle,
  });
  final Wallet wallet;
  final bool excluded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onToggle,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Checkbox(
              value: !excluded,
              onChanged: (_) => onToggle(),
              fillColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? OewangColors.foreground
                    : Colors.transparent,
              ),
              checkColor: OewangColors.background,
            ),
            const SizedBox(width: 4),
            Expanded(child: Text(wallet.name, style: OewangFonts.sans())),
            MoneyText(
              amount: Money(amount: wallet.balance, currency: wallet.currency),
              color: OewangColors.foreground,
            ),
          ],
        ),
      ),
    );
  }
}
