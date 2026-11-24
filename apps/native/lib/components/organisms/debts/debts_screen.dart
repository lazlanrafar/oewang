import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/debts/debts_pay_view_model.dart';
import 'package:oewang/components/organisms/transactions/transactions_sub_tab_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet.dart';

final _debtsProvider = FutureProvider.autoDispose<List<Debt>>((ref) async {
  ref.watch(debtsRevisionProvider);
  final res = await ref.watch(debtsRepositoryProvider).list();
  return res.fold((d) => d, (e) => throw e);
});

final _summaryProvider = FutureProvider.autoDispose<DebtSummary?>((ref) async {
  ref.watch(debtsRevisionProvider);
  final res = await ref.watch(debtsRepositoryProvider).summary();
  return res.fold((s) => s, (_) => null);
});

Color _typeColor(DebtType t) =>
    t == DebtType.receivable ? OewangColors.blue : OewangColors.coral;

/// A payment through a wallet moves its balance and writes a transaction.
void _bumpAll(WidgetRef ref) => ref
  ..read(debtsRevisionProvider.notifier).bump()
  ..read(walletsRevisionProvider.notifier).bump()
  ..read(transactionsRevisionProvider.notifier).bump();

void _showError(BuildContext context, String message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text(message)));

/// Debt tab: money you owe and money owed to you, with the position summary,
/// a receivable/payable filter, create/edit, record payment, payments and
/// delete (DEBT-16). A member sees no control that writes (MOB-5).
class DebtsScreen extends ConsumerStatefulWidget {
  const DebtsScreen({super.key});

  @override
  ConsumerState<DebtsScreen> createState() => _DebtsScreenState();
}

class _DebtsScreenState extends ConsumerState<DebtsScreen> {
  static const _labels = ['All', 'You owe', 'Owed to you'];
  int _index = 0;

  void _bump() => ref.read(debtsRevisionProvider.notifier).bump();

  Future<void> _add() async {
    final saved = await context.push<bool>(AppRoutes.debtForm);
    if (saved ?? false) _bump();
  }

  Future<void> _edit(Debt d) async {
    final saved = await context.push<bool>(
      AppRoutes.debtEditFor(d.id),
      extra: d,
    );
    if (saved ?? false) _bump();
  }

  Future<void> _delete(Debt d) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Delete debt',
      message: 'Remove the debt with "${d.contactName}"?',
    );
    if (!ok) return;
    final res = await ref.read(debtsRepositoryProvider).delete(d.id);
    if (!mounted) return;
    res.fold((_) => _bump(), (e) => _showError(context, e.message));
  }

  Future<void> _openActions(Debt d) async {
    final palette = context.palette;
    final canWrite = ref.read(canWriteProvider);
    ListTile tile(
      IconData icon,
      String label,
      VoidCallback onTap, [
      Color? c,
    ]) => ListTile(
      leading: Icon(icon, color: c ?? palette.foreground),
      title: Text(
        label,
        style: OewangFonts.sans(color: c ?? palette.foreground),
      ),
      onTap: onTap,
    );
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) {
        void then(VoidCallback action) {
          Navigator.of(sheet).pop();
          action();
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (canWrite && !d.isPaid)
                tile(
                  Icons.payments_outlined,
                  'Record payment',
                  () => then(() => _recordPayment(d)),
                ),
              tile(
                Icons.receipt_long_outlined,
                'Payments',
                () => then(() => _payments(d)),
              ),
              if (canWrite) ...[
                tile(Icons.edit_outlined, 'Edit', () => then(() => _edit(d))),
                tile(
                  Icons.delete_outline,
                  'Delete',
                  () => then(() => _delete(d)),
                  OewangColors.coral,
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _recordPayment(Debt d) async {
    final paid = await Navigator.of(
      context,
      rootNavigator: true,
    ).push<bool>(MaterialPageRoute(builder: (_) => PayDebtScreen(debt: d)));
    if (paid ?? false) _bumpAll(ref);
  }

  Future<void> _payments(Debt d) => Navigator.of(
    context,
    rootNavigator: true,
  ).push<void>(MaterialPageRoute(builder: (_) => DebtPaymentsScreen(debt: d)));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_debtsProvider);
    final palette = context.palette;
    final canWrite = ref.watch(canWriteProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(onAdd: canWrite ? _add : null),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) =>
                    _LoadError(onRetry: () => ref.invalidate(_debtsProvider)),
                data: (debts) {
                  final visible = switch (_index) {
                    1 => debts.where((d) => d.type == DebtType.payable),
                    2 => debts.where((d) => d.type == DebtType.receivable),
                    _ => debts,
                  }.toList();
                  return Column(
                    children: [
                      _SummaryHeader(
                        summary: ref.watch(_summaryProvider).valueOrNull,
                      ),
                      Divider(height: 1, color: palette.border),
                      Expanded(
                        child: visible.isEmpty
                            ? _Empty(onAdd: canWrite ? _add : null)
                            : ListView(
                                children: [
                                  for (final d in visible)
                                    _DebtRow(
                                      key: ValueKey(d.id),
                                      debt: d,
                                      onTap: () => _openActions(d),
                                    ),
                                ],
                              ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onAdd});
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: 48,
      child: Row(
        children: [
          const SizedBox(width: 16),
          Text(
            'Debts',
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          IconButton(
            tooltip: 'Contacts',
            onPressed: () => context.push(AppRoutes.contacts),
            icon: Icon(Icons.people_outline, color: palette.foreground),
          ),
          if (onAdd != null)
            IconButton(
              tooltip: 'Add debt',
              onPressed: onAdd,
              icon: Icon(Icons.add, color: palette.foreground),
            ),
        ],
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              "Couldn't load debts",
              style: OewangFonts.sans(
                color: palette.foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Check your connection and try again.',
              textAlign: TextAlign.center,
              style: OewangFonts.sans(
                color: palette.mutedForeground,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: 120,
              child: Button(
                label: 'Retry',
                variant: ButtonVariant.outlined,
                onPressed: onRetry,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Owed to you, you owe and net, as the API computed them in the workspace
/// currency (D27). Blank until the first answer.
class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.summary});
  final DebtSummary? summary;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final s = summary;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _cell(
                'Owed to you',
                s?.owedToYou,
                OewangColors.blue,
                palette,
              ),
            ),
            VerticalDivider(width: 17, thickness: 1, color: palette.border),
            Expanded(
              child: _cell('You owe', s?.youOwe, OewangColors.coral, palette),
            ),
            VerticalDivider(width: 17, thickness: 1, color: palette.border),
            Expanded(
              child: _cell(
                'Net',
                s?.net,
                (s?.net.isNegative ?? false)
                    ? OewangColors.coral
                    : palette.foreground,
                palette,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(
    String label,
    Money? amount,
    Color color,
    OewangPalette palette,
  ) => Column(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Text(
        label,
        style: OewangFonts.sans(color: palette.mutedForeground, fontSize: 12),
      ),
      const SizedBox(height: 2),
      FittedBox(
        fit: BoxFit.scaleDown,
        child: amount == null
            ? Text('-', style: OewangFonts.sans(color: palette.mutedForeground))
            : MoneyText(amount: amount, color: color),
      ),
    ],
  );
}

class _DebtRow extends StatelessWidget {
  const _DebtRow({required this.debt, required this.onTap, super.key});
  final Debt debt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final overdue = debt.isOverdue();
    // The coral color alone isn't a reliable overdue signal (colorblind
    // users, low-attention glances): say "Overdue" too.
    final dueLabel = debt.dueDate == null
        ? null
        : '${overdue ? 'Overdue · ' : ''}Due ${DateFormat('dd/MM/yyyy').format(debt.dueDate!)}';
    final sub = <String>[
      if (debt.description != null && debt.description!.isNotEmpty)
        debt.description!,
      ?dueLabel,
    ].join(' · ');

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: palette.background,
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    debt.contactName,
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: OewangFonts.sans(
                        color: overdue
                            ? OewangColors.coral
                            : palette.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                MoneyText(
                  amount: debt.remainingAmount,
                  color: _typeColor(debt.type),
                  fontWeight: FontWeight.w600,
                ),
                Text(
                  debt.isPartial
                      ? 'of ${debt.amount.format()}'
                      : debt.type == DebtType.receivable
                      ? 'owed to you'
                      : 'you owe',
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

final _payVmProvider = ChangeNotifierProvider.autoDispose
    .family<PayDebtViewModel, Debt>(
      (ref, debt) => PayDebtViewModel(
        debt: debt,
        debts: ref.watch(debtsRepositoryProvider),
        wallets: ref.watch(walletsRepositoryProvider),
        rates: ref.watch(ratesRepositoryProvider),
      ),
    );

/// Full-screen form to record a payment against [debt]. The optional wallet
/// makes the API write the matching transaction. Pops `true` on success,
/// sent or queued (MOB-10).
class PayDebtScreen extends ConsumerWidget {
  const PayDebtScreen({required this.debt, super.key});
  final Debt debt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(_payVmProvider(debt));
    final palette = context.palette;
    final walletAmount = vm.walletAmount;
    return Scaffold(
      appBar: const PageAppBar(title: 'Record payment', backLabel: 'Debts'),
      body: SafeArea(
        child: FormDrawerHost(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: Text(
                        '${debt.contactName} · ${debt.remainingAmount.format()} remaining',
                        style: OewangFonts.sans(
                          color: palette.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Input(
                      context: InputContext.amount,
                      label: 'Amount',
                      currency: debt.currency,
                      amount: vm.amount,
                      onAmountChanged: vm.setAmount,
                    ),
                    Input(
                      context: InputContext.date,
                      label: 'Date',
                      date: vm.date,
                      onDateChanged: vm.setDate,
                    ),
                    Input(
                      context: InputContext.select,
                      label: 'Account',
                      placeholder: 'No account',
                      entity: EntitySelect<Wallet?>(
                        value: vm.wallet,
                        items: [null, ...vm.wallets],
                        labelOf: (w) => w?.name ?? 'No account',
                        idOf: (w) => w?.id ?? '',
                        onSelected: vm.setWallet,
                      ),
                    ),
                    if (vm.needsRate)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Input(
                          label: 'Rate',
                          hintText:
                              '1 ${debt.currency} in ${vm.wallet!.currency}',
                          controller: vm.rateField,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: vm.rateChanged,
                        ),
                      ),
                    if (walletAmount != null && vm.needsRate)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Text(
                          'From the account: ${Money(amount: walletAmount, currency: vm.wallet!.currency).format()}',
                          style: OewangFonts.sans(
                            color: palette.mutedForeground,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    if (vm.error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Text(
                          vm.error!,
                          textAlign: TextAlign.center,
                          style: OewangFonts.sans(color: OewangColors.coral),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Button(
                  label: 'Pay',
                  loading: vm.save.running,
                  onPressed: vm.save.running
                      ? null
                      : () async {
                          if (await vm.submit() && context.mounted) {
                            Navigator.of(context).pop(true);
                          }
                        },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final _paymentsProvider = FutureProvider.autoDispose
    .family<List<DebtPayment>, String>((ref, debtId) async {
      ref.watch(debtsRevisionProvider);
      final res = await ref.watch(debtsRepositoryProvider).payments(debtId);
      return res.fold((p) => p, (e) => throw e);
    });

/// The payments of one debt. Cancelling one also removes its transaction
/// and gives the amount back to the debt (DEBT-7).
class DebtPaymentsScreen extends ConsumerWidget {
  const DebtPaymentsScreen({required this.debt, super.key});
  final Debt debt;

  Future<void> _cancel(
    BuildContext context,
    WidgetRef ref,
    DebtPayment p,
  ) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Cancel payment',
      message:
          'Cancel the ${p.amount.format()} payment? Its transaction is '
          'deleted and the amount is owed again.',
      confirmLabel: 'Cancel payment',
      cancelLabel: 'Keep',
    );
    if (!ok) return;
    final res = await ref
        .read(debtsRepositoryProvider)
        .cancelPayment(debt.id, p.id);
    if (!context.mounted) return;
    res.fold((_) => _bumpAll(ref), (e) => _showError(context, e.message));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    final canWrite = ref.watch(canWriteProvider);
    final async = ref.watch(_paymentsProvider(debt.id));
    return Scaffold(
      appBar: const PageAppBar(title: 'Payments', backLabel: 'Debts'),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => _LoadError(
            onRetry: () => ref.invalidate(_paymentsProvider(debt.id)),
          ),
          data: (payments) => payments.isEmpty
              ? Center(
                  child: Text(
                    'No payments yet',
                    style: OewangFonts.sans(color: palette.mutedForeground),
                  ),
                )
              : ListView(
                  children: [
                    for (final p in payments)
                      ListTile(
                        title: MoneyText(amount: p.amount),
                        subtitle: Text(
                          [
                            DateFormat('dd/MM/yyyy').format(p.date.toLocal()),
                            p.walletName ??
                                (p.walletId == null ? 'No account' : null),
                          ].whereType<String>().join(' · '),
                          style: OewangFonts.sans(
                            color: palette.mutedForeground,
                            fontSize: 12,
                          ),
                        ),
                        trailing: canWrite
                            ? IconButton(
                                tooltip: 'Cancel payment',
                                icon: const Icon(
                                  Icons.undo,
                                  color: OewangColors.coral,
                                ),
                                onPressed: () => _cancel(context, ref, p),
                              )
                            : null,
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.onAdd});
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'No debts yet',
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 16,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Track money you owe and money owed to you.',
            textAlign: TextAlign.center,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
          if (onAdd != null) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: 160,
              child: Button(label: 'Add debt', onPressed: onAdd),
            ),
          ],
        ],
      ),
    );
  }
}
