import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/ui/core/money_text.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';

/// IMG_1829 — account-group expense card + Budget progress + Export CTA.
class TransactionsSummaryScreen extends ConsumerWidget {
  const TransactionsSummaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    final wallets = ref.watch(_walletsSummaryProvider);

    return async.when(
      data: (txs) => wallets.when(
        data: (ws) => _SummaryBody(transactions: txs, wallets: ws),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: _ErrorText(message: e.toString())),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: _ErrorText(message: e.toString())),
    );
  }
}

final _walletsSummaryProvider = FutureProvider.autoDispose<List<Wallet>>((
  ref,
) async {
  final repo = ref.watch(walletsRepositoryProvider);
  final res = await repo.list();
  return res.fold((w) => w, (_) => <Wallet>[]);
});

class _ErrorText extends StatelessWidget {
  const _ErrorText({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Text(
      message,
      textAlign: TextAlign.center,
      style: OewangFonts.sans(color: OewangColors.coral),
    ),
  );
}

class _SummaryBody extends StatelessWidget {
  const _SummaryBody({required this.transactions, required this.wallets});

  final List<Transaction> transactions;
  final List<Wallet> wallets;

  @override
  Widget build(BuildContext context) {
    final byWallet = <String, Money>{};
    for (final t in transactions) {
      if (!t.isExpense) continue;
      byWallet[t.walletId] =
          (byWallet[t.walletId] ?? Money.zero()) + t.amount;
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _AccountsCard(byWallet: byWallet, wallets: wallets),
        const SizedBox(height: 24),
        const _BudgetCard(),
        const SizedBox(height: 24),
        _ExportCard(),
      ],
    );
  }
}

class _AccountsCard extends StatelessWidget {
  const _AccountsCard({required this.byWallet, required this.wallets});
  final Map<String, Money> byWallet;
  final List<Wallet> wallets;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    final rows = <Widget>[];
    for (final w in wallets) {
      final m = byWallet[w.id];
      if (m == null || m.isZero) continue;
      rows.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Exp. (${w.name})',
                  style: OewangFonts.sans(color: palette.foreground),
                ),
              ),
              MoneyText(amount: m, color: tx.expense),
            ],
          ),
        ),
      );
    }
    if (rows.isEmpty) {
      rows.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'No expenses recorded this month',
            style: OewangFonts.sans(color: palette.mutedForeground),
          ),
        ),
      );
    }

    return _Card(
      icon: Icons.savings_outlined,
      title: 'Accounts',
      child: Column(children: rows),
    );
  }
}

class _BudgetCard extends StatelessWidget {
  const _BudgetCard();
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return _Card(
      icon: Icons.account_balance_wallet_outlined,
      title: 'Budget',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              Container(
                height: 6,
                decoration: BoxDecoration(
                  color: palette.muted,
                  borderRadius: BorderRadius.circular(OewangRadius.pill),
                ),
              ),
              const Positioned(
                left: 0,
                right: 0,
                top: -22,
                child: Center(child: _TodayChip()),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total Budget',
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    'Rp 0,00',
                    style: OewangFonts.currency(
                      color: palette.foreground,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              Text(
                '0%',
                style: OewangFonts.sans(color: palette.mutedForeground),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TodayChip extends StatelessWidget {
  const _TodayChip();
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: palette.muted,
        borderRadius: BorderRadius.circular(OewangRadius.pill),
      ),
      child: Text(
        'Today',
        style: OewangFonts.sans(color: palette.foreground, fontSize: 11),
      ),
    );
  }
}

class _ExportCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Material(
      color: palette.card,
      borderRadius: BorderRadius.circular(OewangRadius.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(OewangRadius.lg),
        onTap: () => ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Export to Excel coming in a later milestone'),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: palette.border),
            borderRadius: BorderRadius.circular(OewangRadius.lg),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.grid_on, color: Color(0xFF1FA463)),
              const SizedBox(width: 8),
              Text(
                'Export data to Excel',
                style: OewangFonts.sans(
                  color: palette.foreground,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.icon, required this.title, required this.child});

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: palette.foreground, size: 18),
            const SizedBox(width: 8),
            Text(
              title,
              style: OewangFonts.sans(
                color: palette.foreground,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.card,
            border: Border.all(color: palette.border),
            borderRadius: BorderRadius.circular(OewangRadius.lg),
          ),
          child: child,
        ),
      ],
    );
  }
}
