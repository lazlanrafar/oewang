import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

/// IMG_2250 — checkbox-driven Include-in-Totals editor. Each tick writes the
/// wallet's `is_included_in_totals` at once; a refused write puts it back.
class IncludeInTotalsScreen extends ConsumerStatefulWidget {
  const IncludeInTotalsScreen({super.key});

  @override
  ConsumerState<IncludeInTotalsScreen> createState() =>
      _IncludeInTotalsScreenState();
}

class _IncludeInTotalsScreenState extends ConsumerState<IncludeInTotalsScreen> {
  /// Ticks changed on this screen, ahead of the next list read.
  final Map<String, bool> _included = {};

  Future<void> _toggle(Wallet w) async {
    final next = !(_included[w.id] ?? w.isIncludedInTotals);
    setState(() => _included[w.id] = next);
    final res = await ref
        .read(walletsRepositoryProvider)
        .setIncludedInTotals(w.id, included: next);
    if (!mounted) return;
    res.fold((_) => ref.read(walletsRevisionProvider.notifier).bump(), (e) {
      setState(() => _included[w.id] = !next);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    });
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(_groupsProvider);
    final walletsAsync = ref.watch(_walletsProvider);
    final canWrite = ref.watch(canWriteProvider);
    final currency =
        ref.watch(currentWorkspaceProvider).valueOrNull?.currencyCode ?? '';
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;

    return Scaffold(
      appBar: const PageAppBar(
        title: 'Include in totals',
        backLabel: 'Accounts',
      ),
      body: SafeArea(
        child: groupsAsync.when(
          data: (groups) => walletsAsync.when(
            data: (wallets) => _Body(
              groups: groups,
              wallets: wallets,
              currency: currency,
              excluded: {
                for (final w in wallets)
                  if (!(_included[w.id] ?? w.isIncludedInTotals)) w.id,
              },
              onToggle: canWrite ? _toggle : null,
              tx: tx,
              palette: palette,
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
  ref.watch(walletsRevisionProvider);
  final res = await ref.watch(walletsRepositoryProvider).list();
  return res.fold((w) => w, (_) => const []);
});

class _Body extends StatelessWidget {
  const _Body({
    required this.groups,
    required this.wallets,
    required this.currency,
    required this.excluded,
    required this.onToggle,
    required this.tx,
    required this.palette,
  });

  final List<WalletGroup> groups;
  final List<Wallet> wallets;

  /// The workspace currency; foreign wallets stay out of the sums, as on
  /// the Accounts tab.
  final String currency;
  final Set<String> excluded;

  /// Null for a member, who sees the ticks and cannot change them (MOB-5).
  final ValueChanged<Wallet>? onToggle;
  final TransactionColors tx;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    var assets = Money.zero(currency: currency);
    var liabilities = Money.zero(currency: currency);
    for (final w in wallets) {
      if (excluded.contains(w.id) || w.currency != currency) continue;
      if (w.balance >= Decimal.zero) {
        assets += Money(amount: w.balance, currency: w.currency);
      } else {
        liabilities += Money(amount: -w.balance, currency: w.currency);
      }
    }
    final byGroup = <String?, List<Wallet>>{};
    for (final w in wallets) {
      byGroup.putIfAbsent(w.groupId, () => <Wallet>[]).add(w);
    }
    Widget rowFor(Wallet w) => _Row(
      wallet: w,
      excluded: excluded.contains(w.id),
      onToggle: onToggle == null ? null : () => onToggle!(w),
    );
    return Column(
      children: [
        _SummaryRow(
          assets: assets,
          liabilities: liabilities,
          tx: tx,
          palette: palette,
        ),
        Divider(height: 1, color: palette.border),
        Expanded(
          child: ListView(
            children: [
              // Only render a group header when it actually has accounts.
              for (final g in groups)
                if ((byGroup[g.id] ?? const []).isNotEmpty) ...[
                  _GroupHeader(
                    name: g.name,
                    subtotal: _subtotal(byGroup[g.id]!, excluded),
                  ),
                  for (final w in byGroup[g.id]!) rowFor(w),
                ],
              // Ungrouped wallets, which the old screen left off the list.
              if ((byGroup[null] ?? const []).isNotEmpty) ...[
                _GroupHeader(
                  name: 'Others',
                  subtotal: _subtotal(byGroup[null]!, excluded),
                ),
                for (final w in byGroup[null]!) rowFor(w),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Money _subtotal(List<Wallet> ws, Set<String> excluded) {
    var total = Money.zero(currency: currency);
    for (final w in ws) {
      if (excluded.contains(w.id) || w.currency != currency) continue;
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
    required this.palette,
  });

  final Money assets;
  final Money liabilities;
  final TransactionColors tx;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    final total = assets - liabilities;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: _Cell(label: 'Account', value: assets, color: tx.income),
          ),
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
              color: palette.foreground,
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
          color: context.palette.mutedForeground,
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
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      color: palette.muted,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
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

class _Row extends StatelessWidget {
  const _Row({
    required this.wallet,
    required this.excluded,
    required this.onToggle,
  });
  final Wallet wallet;
  final bool excluded;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onToggle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Row(
          children: [
            Checkbox(
              value: !excluded,
              onChanged: onToggle == null ? null : (_) => onToggle!(),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              fillColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? palette.foreground
                    : Colors.transparent,
              ),
              checkColor: palette.background,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                wallet.name,
                style: OewangFonts.sans(color: palette.foreground),
              ),
            ),
            MoneyText(
              amount: Money(amount: wallet.balance, currency: wallet.currency),
              color: palette.foreground,
            ),
          ],
        ),
      ),
    );
  }
}
