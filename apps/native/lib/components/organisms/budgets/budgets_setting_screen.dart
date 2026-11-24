import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/money_text.dart';
import 'package:oewang/components/molecules/confirm_dialog.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

/// Keyed by the month shown; null is the API's default, this month.
final _budgetsProvider = FutureProvider.autoDispose
    .family<BudgetMonth, DateTime?>((ref, month) async {
      ref.watch(budgetsRevisionProvider);
      final res = await ref
          .watch(budgetsRepositoryProvider)
          .status(month: month?.month, year: month?.year);
      return res.fold((m) => m, (_) => BudgetMonth.empty());
    });

/// Budget Setting — list of per-category monthly budgets with create / edit /
/// swipe-to-delete, plus a summary header (total budgeted vs spent).
class BudgetSettingScreen extends ConsumerWidget {
  const BudgetSettingScreen({super.key, this.month});

  /// `YYYY-MM` from a tapped budget push (`?month=`, PUSH-5); null or
  /// malformed shows this month.
  final String? month;

  DateTime? get _month {
    final m = month;
    if (m == null || !RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(m)) {
      return null;
    }
    return DateTime.parse('$m-01');
  }

  void _bump(WidgetRef ref) =>
      ref.read(budgetsRevisionProvider.notifier).bump();

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final saved = await context.push<bool>(AppRoutes.budgetForm);
    if (saved ?? false) _bump(ref);
  }

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    BudgetStatus b,
  ) async {
    final saved = await context.push<bool>(
      AppRoutes.budgetEditFor(b.id),
      extra: b,
    );
    if (saved ?? false) _bump(ref);
  }

  Future<bool> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    BudgetStatus b,
  ) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Delete budget',
      message: 'Remove the budget for "${b.categoryName}"?',
    );
    if (!ok) return false;
    final res = await ref.read(budgetsRepositoryProvider).delete(b.id);
    return res.fold((_) {
      _bump(ref);
      return true;
    }, (_) => false);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shown = _month;
    final async = ref.watch(_budgetsProvider(shown));
    final canWrite = ref.watch(canWriteProvider);
    final palette = context.palette;

    return Scaffold(
      appBar: PageAppBar(
        title: shown == null
            ? 'Budget'
            : 'Budget, ${DateFormat('MMM yyyy').format(shown)}',
        backLabel: 'Settings',
        actions: [
          if (canWrite)
            IconButton(
              onPressed: () => _add(context, ref),
              icon: Icon(Icons.add, color: palette.foreground),
            ),
        ],
      ),
      body: SafeArea(
        child: async.when(
          data: (month) {
            final budgets = month.budgets;
            if (budgets.isEmpty) {
              return _Empty(onAdd: canWrite ? () => _add(context, ref) : null);
            }
            return Column(
              children: [
                _SummaryHeader(totals: month.totals),
                Divider(height: 1, color: palette.border),
                Expanded(
                  child: ListView(
                    children: [
                      for (final b in budgets)
                        if (!canWrite)
                          _BudgetRow(budget: b)
                        else
                          Dismissible(
                            key: ValueKey(b.id),
                            direction: DismissDirection.endToStart,
                            confirmDismiss: (_) =>
                                _confirmDelete(context, ref, b),
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
                            child: _BudgetRow(
                              budget: b,
                              onTap: () => _edit(context, ref, b),
                            ),
                          ),
                    ],
                  ),
                ),
              ],
            );
          },
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

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.totals});
  final BudgetTotals totals;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: _SummaryCell(
              label: 'Budget',
              amount: totals.totalBudget,
              color: palette.foreground,
            ),
          ),
          Expanded(
            child: _SummaryCell(
              label: 'Spent',
              amount: totals.totalSpent,
              color: OewangColors.coral,
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  'Used',
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${totals.percent}%',
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCell extends StatelessWidget {
  const _SummaryCell({
    required this.label,
    required this.amount,
    required this.color,
  });
  final String label;
  final Money amount;
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
      MoneyText(amount: amount, color: color),
    ],
  );
}

class _BudgetRow extends StatelessWidget {
  const _BudgetRow({required this.budget, this.onTap});
  final BudgetStatus budget;

  /// Null for a member, who reads the budget and cannot edit it (MOB-5).
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final over = budget.percentage >= 100;
    final barColor = over ? OewangColors.coral : palette.foreground;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: palette.background,
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    budget.categoryName,
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                MoneyText(amount: budget.amount, color: palette.foreground),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: (budget.percentage / 100).clamp(0.0, 1.0),
              minHeight: 4,
              borderRadius: BorderRadius.zero,
              backgroundColor: palette.border,
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                MoneyText(
                  amount: budget.spent,
                  color: palette.mutedForeground,
                  fontSize: 12,
                ),
                Text(
                  ' spent · ',
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 12,
                  ),
                ),
                MoneyText(
                  amount: budget.remaining,
                  color: palette.mutedForeground,
                  fontSize: 12,
                ),
                Text(
                  ' left',
                  style: OewangFonts.sans(
                    color: palette.mutedForeground,
                    fontSize: 12,
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

class _Empty extends StatelessWidget {
  const _Empty({required this.onAdd});

  /// Null for a member: the empty state then has no create button.
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'No budgets set',
            style: OewangFonts.sans(
              color: palette.foreground,
              fontSize: 16,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Start tracking your spending by creating a budget.',
            textAlign: TextAlign.center,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 13,
            ),
          ),
          if (onAdd != null) ...[
            const SizedBox(height: 16),
            Button(label: 'Create Budget', fullWidth: false, onPressed: onAdd),
          ],
        ],
      ),
    );
  }
}
