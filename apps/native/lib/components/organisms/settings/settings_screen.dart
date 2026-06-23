import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/atoms/section_label.dart';
import 'package:oewang/components/molecules/list_row.dart';
import 'package:oewang/components/organisms/settings/profile/settings_user_profile_header.dart';
import 'package:oewang/components/organisms/settings/workspace/settings_workspace_card.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

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
            const _Header(version: ''),
            Divider(height: 1, color: palette.border),
            Expanded(
              // Gray backdrop shows through the gaps between sections; rows and
              // labels paint a white (background) card on top — mirrors the
              // transactions Daily view grouping.
              child: ColoredBox(
                color: palette.border.withValues(alpha: 0.5),
                child: ListView(
                  children: [
                    const UserProfileHeader(),
                    const WorkspaceCard(),
                    const SectionLabel('Trans.'),
                    ListRow(
                      icon: Icons.menu_book_outlined,
                      title: 'Transaction Settings',
                      subtitle:
                          'Monthly Start Date, Carry-over Setting, Period, Oth…',
                      onTap: () => context.push(AppRoutes.transactionSettings),
                    ),
                    ListRow(
                      icon: Icons.repeat,
                      title: 'Repeat Setting',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Repeat Setting'),
                    ),
                    ListRow(
                      icon: Icons.content_copy_outlined,
                      title: 'Copy-Paste Settings',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Copy-Paste Settings'),
                    ),
                    const SectionLabel('Category/Accounts'),
                    ListRow(
                      icon: Icons.add_circle_outline,
                      title: 'Income Category Setting',
                      onTap: () => context.push(AppRoutes.categoriesIncome),
                    ),
                    ListRow(
                      icon: Icons.remove_circle_outline,
                      title: 'Expenses Category Setting',
                      onTap: () => context.push(AppRoutes.categoriesExpense),
                    ),
                    ListRow(
                      icon: Icons.savings_outlined,
                      title: 'Accounts Setting',
                      subtitle:
                          'Account Group, Accounts, Include in totals, Transf…',
                      onTap: () => context.push(AppRoutes.accountsSettings),
                    ),
                    ListRow(
                      icon: Icons.account_balance_wallet_outlined,
                      title: 'Budget Setting',
                      onTap: () => context.push(AppRoutes.budgetSettings),
                    ),
                    const SectionLabel('Settings'),
                    ListRow(
                      icon: Icons.refresh,
                      title: 'Backup',
                      subtitle: 'Export, Import, A complete reset',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Backup'),
                    ),
                    ListRow(
                      icon: Icons.lock_outline,
                      title: 'Passcode',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Passcode'),
                    ),
                    ListRow(
                      icon: Icons.payments_outlined,
                      title: 'Main Currency Setting',
                      subtitle: 'IDR(Rp)',
                      onTap: () => context.push(AppRoutes.mainCurrency),
                    ),
                    ListRow(
                      icon: Icons.payments_outlined,
                      title: 'Sub Currency Setting',
                      onTap: () => context.push(AppRoutes.subCurrency),
                    ),
                    ListRow(
                      icon: Icons.notifications_none,
                      title: 'Alarm Setting',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Alarm'),
                    ),
                    ListRow(
                      icon: Icons.palette_outlined,
                      title: 'Style',
                      onTap: () => context.push(AppRoutes.style),
                    ),
                    ListRow(
                      icon: Icons.rocket_launch_outlined,
                      title: 'Application Icon',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Application Icon'),
                    ),
                    ListRow(
                      icon: Icons.translate,
                      title: 'Language Setting',
                      trailing: const _ComingSoonBadge(),
                      onTap: () => _comingSoon(context, 'Language'),
                    ),
                    const SizedBox(height: 8),
                    ListRow(
                      icon: Icons.logout,
                      title: 'Log out',
                      onTap: () async => _confirmLogout(context, ref),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _comingSoon(BuildContext context, String label) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$label — coming soon')));
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

/// Small muted pill marking a settings entry that isn't built yet.
class _ComingSoonBadge extends StatelessWidget {
  const _ComingSoonBadge();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: palette.border.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'Coming soon',
        style: OewangFonts.sans(
          color: palette.mutedForeground,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
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
