import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// IMG_2247 — Accounts Setting hub.
///
/// The old "Card expenses display config" row is gone: it was only ever held
/// on the screen, and the API has no card wallets or display setting to save
/// it to.
class AccountsSettingsScreen extends StatelessWidget {
  const AccountsSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const PageAppBar(title: 'Accounts', backLabel: 'Settings'),
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
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.onTap});

  final String label;
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
          ],
        ),
      ),
    );
  }
}
