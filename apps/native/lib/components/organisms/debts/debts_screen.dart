import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/money_text.dart';
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
  return res.fold((d) => d, (_) => const []);
});

Color _typeColor(DebtType t) =>
    t == DebtType.receivable ? OewangColors.blue : OewangColors.coral;

/// Debt tab — money you owe and money owed to you, with a position summary,
/// receivable/payable filter, create/edit, record-payment, and swipe-delete.
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

  Future<bool> _delete(Debt d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete debt'),
        content: Text('Remove the debt with "${d.contactName}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return false;
    final res = await ref.read(debtsRepositoryProvider).delete(d.id);
    return res.fold((_) {
      _bump();
      return true;
    }, (_) => false);
  }

  Future<void> _openActions(Debt d) async {
    final palette = context.palette;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!d.isPaid)
              ListTile(
                leading: Icon(
                  Icons.payments_outlined,
                  color: palette.foreground,
                ),
                title: Text('Record payment', style: OewangFonts.sans()),
                onTap: () {
                  Navigator.of(sheet).pop();
                  _recordPayment(d);
                },
              ),
            ListTile(
              leading: Icon(Icons.edit_outlined, color: palette.foreground),
              title: Text('Edit', style: OewangFonts.sans()),
              onTap: () {
                Navigator.of(sheet).pop();
                _edit(d);
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline,
                color: OewangColors.coral,
              ),
              title: Text(
                'Delete',
                style: OewangFonts.sans(color: OewangColors.coral),
              ),
              onTap: () async {
                Navigator.of(sheet).pop();
                await _delete(d);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _recordPayment(Debt d) async {
    final paid = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PayDebtSheet(debt: d),
    );
    if (paid ?? false) _bump();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_debtsProvider);
    final palette = context.palette;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(onAdd: _add),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text(
                    e.toString(),
                    style: OewangFonts.sans(color: OewangColors.coral),
                  ),
                ),
                data: (debts) {
                  final visible = switch (_index) {
                    1 => debts.where((d) => d.type == DebtType.payable),
                    2 => debts.where((d) => d.type == DebtType.receivable),
                    _ => debts,
                  }.toList();
                  return Column(
                    children: [
                      _SummaryHeader(totals: DebtTotals.fromDebts(debts)),
                      Divider(height: 1, color: palette.border),
                      Expanded(
                        child: visible.isEmpty
                            ? _Empty(onAdd: _add)
                            : ListView(
                                children: [
                                  for (final d in visible)
                                    Dismissible(
                                      key: ValueKey(d.id),
                                      direction: DismissDirection.endToStart,
                                      confirmDismiss: (_) => _delete(d),
                                      background: Container(
                                        color: OewangColors.coral,
                                        alignment: Alignment.centerRight,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 16,
                                        ),
                                        child: const Icon(
                                          Icons.delete,
                                          color: Colors.white,
                                        ),
                                      ),
                                      child: _DebtRow(
                                        debt: d,
                                        onTap: () => _openActions(d),
                                      ),
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
  final VoidCallback onAdd;

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
            onPressed: onAdd,
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
    );
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.totals});
  final DebtTotals totals;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: _cell(
              'Owed to you',
              totals.owedToYou,
              OewangColors.blue,
              palette,
            ),
          ),
          Expanded(
            child: _cell('You owe', totals.youOwe, OewangColors.coral, palette),
          ),
          Expanded(
            child: _cell(
              'Net',
              totals.net,
              totals.net.isNegative ? OewangColors.coral : palette.foreground,
              palette,
            ),
          ),
        ],
      ),
    );
  }

  Widget _cell(
    String label,
    Money amount,
    Color color,
    OewangPalette palette,
  ) => Column(
    children: [
      Text(
        label,
        style: OewangFonts.sans(color: palette.mutedForeground, fontSize: 12),
      ),
      const SizedBox(height: 2),
      MoneyText(amount: amount, color: color),
    ],
  );
}

class _DebtRow extends StatelessWidget {
  const _DebtRow({required this.debt, required this.onTap});
  final Debt debt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final overdue = debt.isOverdue();
    final sub = <String>[
      if (debt.description != null && debt.description!.isNotEmpty)
        debt.description!,
      if (debt.dueDate != null)
        'Due ${DateFormat('dd/MM/yyyy').format(debt.dueDate!)}',
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
                if (debt.isPartial)
                  Text(
                    'of ${debt.amount.format()}',
                    style: OewangFonts.sans(
                      color: palette.mutedForeground,
                      fontSize: 11,
                    ),
                  )
                else
                  Text(
                    debt.type == DebtType.receivable
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

/// Bottom sheet to record a payment against [debt]. The optional wallet creates
/// the matching transaction server-side.
class _PayDebtSheet extends ConsumerStatefulWidget {
  const _PayDebtSheet({required this.debt});
  final Debt debt;

  @override
  ConsumerState<_PayDebtSheet> createState() => _PayDebtSheetState();
}

class _PayDebtSheetState extends ConsumerState<_PayDebtSheet> {
  final _controller = TextEditingController();
  List<Wallet> _wallets = const [];
  String? _walletId;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller.text = widget.debt.remainingAmount.amount.toString();
    _loadWallets();
  }

  Future<void> _loadWallets() async {
    final res = await ref.read(walletsRepositoryProvider).list();
    if (!mounted) return;
    res.fold((ws) => setState(() => _wallets = ws), (_) {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    final amount = num.tryParse(_controller.text.trim()) ?? 0;
    if (amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final res = await ref
        .read(debtsRepositoryProvider)
        .pay(id: widget.debt.id, amount: amount, walletId: _walletId);
    if (!mounted) return;
    res.fold(
      (_) => Navigator.of(context).pop(true),
      (e) => setState(() {
        _saving = false;
        _error = e.message;
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Record payment',
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.debt.contactName} · ${widget.debt.remainingAmount.format()} remaining',
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: OewangFonts.sans(color: palette.foreground),
            decoration: InputDecoration(
              labelText: 'Amount',
              labelStyle: OewangFonts.sans(color: palette.mutedForeground),
            ),
          ),
          const SizedBox(height: 16),
          DropdownButton<String?>(
            value: _walletId,
            isExpanded: true,
            hint: Text(
              'Account (optional)',
              style: OewangFonts.sans(color: palette.mutedForeground),
            ),
            items: [
              DropdownMenuItem<String?>(
                child: Text(
                  'No account',
                  style: OewangFonts.sans(color: palette.foreground),
                ),
              ),
              for (final w in _wallets)
                DropdownMenuItem<String?>(
                  value: w.id,
                  child: Text(
                    w.name,
                    style: OewangFonts.sans(color: palette.foreground),
                  ),
                ),
            ],
            onChanged: (v) => setState(() => _walletId = v),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: OewangFonts.sans(color: OewangColors.coral, fontSize: 12),
            ),
          ],
          const SizedBox(height: 16),
          Button(
            label: 'Pay',
            loading: _saving,
            onPressed: _saving ? null : _pay,
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.onAdd});
  final VoidCallback onAdd;

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
          const SizedBox(height: 16),
          SizedBox(
            width: 160,
            child: Button(label: 'Add debt', onPressed: onAdd),
          ),
        ],
      ),
    );
  }
}
