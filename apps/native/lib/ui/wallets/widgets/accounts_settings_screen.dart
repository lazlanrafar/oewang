import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/core/page_app_bar.dart';
import 'package:oewang/ui/wallets/widgets/card_expenses_display_sheet.dart';

/// IMG_2247 — Accounts Setting hub.
class AccountsSettingsScreen extends StatefulWidget {
  const AccountsSettingsScreen({super.key});

  @override
  State<AccountsSettingsScreen> createState() => _AccountsSettingsScreenState();
}

class _AccountsSettingsScreenState extends State<AccountsSettingsScreen> {
  CardExpensesDisplayMode _cardMode = CardExpensesDisplayMode.atTheTime;

  Future<void> _openCardModeSheet() async {
    final picked = await CardExpensesDisplaySheet.show(
      context,
      current: _cardMode,
    );
    if (picked != null && mounted) setState(() => _cardMode = picked);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const PageAppBar(
        title: 'Accounts',
        backLabel: 'Settings',
      ),
      body: SafeArea(
        child: ListView(
          children: [
            _Row(
              label: 'Account Group',
              onTap: () => context.push(AppRoutes.accountGroup),
            ),
            _Row(
              label: 'Accounts Setting',
              onTap: () => context.push(AppRoutes.accountSimpleList),
            ),
            _Row(
              label: 'Include in totals',
              onTap: () => context.push(AppRoutes.includeInTotals),
            ),
            _Row(
              label: 'Transfer-Expense setting',
              onTap: () => context.push(AppRoutes.transferExpense),
            ),
            _Row(
              label: 'Deleted accounts',
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Deleted accounts — coming soon'),
                ),
              ),
            ),
            _Row(
              label: 'Card expenses display config',
              trailing: Text(
                _cardMode == CardExpensesDisplayMode.atTheTime
                    ? 'A. At the time'
                    : 'B. Lump sum',
                style: OewangFonts.sans(color: OewangColors.coral),
              ),
              onTap: _openCardModeSheet,
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.onTap, this.trailing});

  final String label;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: OewangFonts.sans(color: palette.foreground),
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
