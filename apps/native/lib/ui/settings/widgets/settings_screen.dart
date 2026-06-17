import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/settings/widgets/user_profile_header.dart';
import 'package:oewang/ui/settings/widgets/workspace_card.dart';

/// IMG_1844 + IMG_2244 — More tab. Grouped list of settings entries.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const _Header(version: '2.12.3 AP'),
            Divider(height: 1, color: palette.border),
            Expanded(
              child: ListView(
                children: [
                  const UserProfileHeader(),
                  const WorkspaceCard(),
                  _Row(
                    icon: Icons.menu_book_outlined,
                    title: 'Transaction Settings',
                    subtitle:
                        'Monthly Start Date, Carry-over Setting, Period, Oth…',
                    onTap: () =>
                        context.push(AppRoutes.transactionSettings),
                  ),
                  _Row(
                    icon: Icons.repeat,
                    title: 'Repeat Setting',
                    onTap: () => _comingSoon(context, 'Repeat Setting'),
                  ),
                  _Row(
                    icon: Icons.content_copy_outlined,
                    title: 'Copy-Paste Settings',
                    onTap: () => _comingSoon(context, 'Copy-Paste Settings'),
                  ),
                  const _SectionLabel('Category/Accounts'),
                  _Row(
                    icon: Icons.add_circle_outline,
                    title: 'Income Category Setting',
                    onTap: () =>
                        context.push(AppRoutes.categoriesIncome),
                  ),
                  _Row(
                    icon: Icons.remove_circle_outline,
                    title: 'Expenses Category Setting',
                    onTap: () =>
                        context.push(AppRoutes.categoriesExpense),
                  ),
                  _Row(
                    icon: Icons.savings_outlined,
                    title: 'Accounts Setting',
                    subtitle:
                        'Account Group, Accounts, Include in totals, Transf…',
                    onTap: () => context.push(AppRoutes.accountsSettings),
                  ),
                  _Row(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Budget Setting',
                    onTap: () => _comingSoon(context, 'Budget Setting'),
                  ),
                  const _SectionLabel('Settings'),
                  _Row(
                    icon: Icons.refresh,
                    title: 'Backup',
                    subtitle: 'Export, Import, A complete reset',
                    onTap: () => _comingSoon(context, 'Backup'),
                  ),
                  _Row(
                    icon: Icons.lock_outline,
                    title: 'Passcode',
                    trailing: Text(
                      'OFF',
                      style: OewangFonts.sans(
                        color: OewangColors.coral,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    onTap: () => _comingSoon(context, 'Passcode'),
                  ),
                  _Row(
                    icon: Icons.payments_outlined,
                    title: 'Main Currency Setting',
                    subtitle: 'IDR(Rp)',
                    onTap: () => context.push(AppRoutes.mainCurrency),
                  ),
                  _Row(
                    icon: Icons.payments_outlined,
                    title: 'Sub Currency Setting',
                    onTap: () => context.push(AppRoutes.subCurrency),
                  ),
                  _Row(
                    icon: Icons.notifications_none,
                    title: 'Alarm Setting',
                    onTap: () => _comingSoon(context, 'Alarm'),
                  ),
                  _Row(
                    icon: Icons.palette_outlined,
                    title: 'Style',
                    onTap: () => context.push(AppRoutes.style),
                  ),
                  _Row(
                    icon: Icons.rocket_launch_outlined,
                    title: 'Application Icon',
                    onTap: () => _comingSoon(context, 'Application Icon'),
                  ),
                  _Row(
                    icon: Icons.translate,
                    title: 'Language Setting',
                    onTap: () => _comingSoon(context, 'Language'),
                  ),
                  const SizedBox(height: 8),
                  _Row(
                    icon: Icons.logout,
                    title: 'Log out',
                    onTap: () async => _confirmLogout(context, ref),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _comingSoon(BuildContext context, String label) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$label — coming soon')),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out'),
        content: const Text('You will need to sign in again to use the app.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await ref.read(sessionControllerProvider.notifier).clear();
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.version});
  final String version;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: 48,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Center(
            child: Text(
              'Settings',
              style: OewangFonts.sans(
                color: palette.foreground,
                fontSize: 17,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Positioned(
            right: 16,
            child: Text(
              version,
              style: OewangFonts.sans(color: palette.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      color: palette.background,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(
        label,
        style: OewangFonts.sans(
          color: palette.mutedForeground,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: palette.foreground, size: 22),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: OewangFonts.sans(
                      color: palette.foreground,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: OewangFonts.sans(
                        color: palette.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
