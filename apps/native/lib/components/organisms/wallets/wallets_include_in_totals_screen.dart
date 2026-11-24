import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

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
    // The API's figures (D117); they catch up once a tick has been saved.
    final totals = ref.watch(_totalsProvider).valueOrNull;
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
              totals: totals,
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

final _totalsProvider = FutureProvider.autoDispose<WalletTotals?>((ref) async {
  ref.watch(walletsRevisionProvider);
  final res = await ref.watch(walletsRepositoryProvider).totals();
  return res.fold((t) => t, (_) => null);
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
    required this.totals,
    required this.excluded,
    required this.onToggle,
    required this.tx,
    required this.palette,
  });

  final List<WalletGroup> groups;
  final List<Wallet> wallets;

  /// Null until the API answers; the figures then show zero.
  final WalletTotals? totals;
  final Set<String> excluded;

  /// Null for a member, who sees the ticks and cannot change them (MOB-5).
  final ValueChanged<Wallet>? onToggle;
  final TransactionColors tx;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    final zero = Money.zero(currency: totals?.total.currency ?? 'IDR');
    Money subtotal(String? id) => totals?.group(id)?.subtotal ?? zero;
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
          assets: totals?.assets ?? zero,
          liabilities: totals?.liabilities ?? zero,
          total: totals?.total ?? zero,
          note: totalsNote(
            leftOut: totals?.leftOut ?? 0,
            estimate: totals?.isEstimate ?? false,
          ),
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
                  _GroupHeader(name: g.name, subtotal: subtotal(g.id)),
                  for (final w in byGroup[g.id]!) rowFor(w),
                ],
              // Ungrouped wallets, which the old screen left off the list.
              if ((byGroup[null] ?? const []).isNotEmpty) ...[
                _GroupHeader(name: 'Others', subtotal: subtotal(null)),
                for (final w in byGroup[null]!) rowFor(w),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.assets,
    required this.liabilities,
    required this.total,
    required this.tx,
    required this.palette,
    this.note,
  });

  final Money assets;
  final Money liabilities;
  final Money total;
  final String? note;
  final TransactionColors tx;
  final OewangPalette palette;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(
        children: [
          Row(
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
          if (note != null) ...[
            const SizedBox(height: 4),
            Text(
              note!,
              style: OewangFonts.sans(
                color: palette.mutedForeground,
                fontSize: 12,
              ),
            ),
          ],
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
