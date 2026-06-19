import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/organisms/transactions/transactions_calendar_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_header.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_picker_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_monthly_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_sub_tab_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_row.dart';
import 'package:oewang/components/organisms/transactions/transactions_summary_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:url_launcher/url_launcher.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  static const _labels = [
    'Daily',
    'Calendar',
    'Monthly',
    'Summary',
    'Description',
  ];
  int _index = 0;
  // ponytail: not plan-gated (plan isn't in the JWT); shown until dismissed.
  bool _showUpgrade = true;

  Future<void> _openUpgrade() async {
    final appUrl = ref.read(envProvider).appUrl;
    await launchUrl(
      Uri.parse('$appUrl/en/upgrade'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final monthCtl = ref.read(monthControllerProvider.notifier);
    final month = ref.watch(monthControllerProvider);
    final async = ref.watch(monthTransactionsProvider(month));
    final totals = async.maybeWhen(
      data: computeMonthTotals,
      orElse: () =>
          const MonthTotals(income: Money(amount: 0), expense: Money(amount: 0)),
    );
    final yearOnlyMonthBar = _index == 2; // Monthly tab shows the year only.
    final palette = context.palette;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            if (_showUpgrade)
              _UpgradeBanner(
                onTap: _openUpgrade,
                onDismiss: () => setState(() => _showUpgrade = false),
              ),
            const TransactionsHeader(),
            SubTabBar(
              labels: _labels,
              currentIndex: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
            Divider(height: 1, color: palette.border),
            MonthPickerBar(
              month: month,
              yearOnly: yearOnlyMonthBar,
              onPrev: monthCtl.prev,
              onNext: monthCtl.next,
            ),
            TransactionsSummaryRow(
              income: totals.income,
              expense: totals.expense,
            ),
            Expanded(
              child: switch (_index) {
                0 => const TransactionsDailyScreen(),
                1 => const TransactionsCalendarScreen(),
                2 => const TransactionsMonthlyScreen(),
                3 => const TransactionsSummaryScreen(),
                _ => const _Description(),
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Dismissible nudge to buy a paid plan on the web (mobile is free-only).
class _UpgradeBanner extends StatelessWidget {
  const _UpgradeBanner({required this.onTap, required this.onDismiss});
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Material(
      color: OewangColors.coral.withValues(alpha: 0.12),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.workspace_premium_outlined,
                  size: 18, color: OewangColors.coral),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "You're on the Free plan — upgrade on the web for more.",
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 13,
                  ),
                ),
              ),
              Icon(Icons.open_in_new, size: 14, color: palette.mutedForeground),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: onDismiss,
                child: Icon(Icons.close,
                    size: 16, color: palette.mutedForeground),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Description extends StatelessWidget {
  const _Description();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Description — coming soon',
        style: OewangFonts.sans(color: context.palette.mutedForeground),
      ),
    );
  }
}
