import 'package:flutter/material.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/services/auth_service.dart';
import 'package:go_router/go_router.dart';

class SettingTab extends StatelessWidget {
  const SettingTab({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.only(top: 8, bottom: 40),
      children: [
        // Top Section (No Header)
        _buildListTile(
          context,
          icon: Icons.receipt_long_outlined,
          title: "Transaction Settings",
          subtitle: "Monthly Start Date, Carry-over Setting, Period, Oth...",
          onTap: () {
            context.push('/settings/transaction');
          },
        ),
        _buildListTile(
          context,
          icon: Icons.repeat,
          title: "Repeat Setting",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.file_copy_outlined,
          title: "Copy-Paste Settings",
          isComingSoon: true,
          onTap: () {},
        ),

        const SizedBox(height: 16),
        _buildSectionHeader(context, "Category/Accounts"),
        _buildListTile(
          context,
          icon: Icons.add_circle_outline, // closest to stack with +
          title: "Income Category Setting",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.remove_circle_outline, // closest to stack with -
          title: "Expenses Category Setting",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.account_balance_outlined,
          title: "Accounts Setting",
          subtitle: "Account Group, Accounts, Include in totals, Transf...",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.edit_document,
          title: "Budget Setting",
          isComingSoon: true,
          onTap: () {},
        ),

        const SizedBox(height: 16),
        _buildSectionHeader(context, "Settings"),
        _buildListTile(
          context,
          icon: Icons.settings_backup_restore,
          title: "Backup",
          subtitle: "Export, Import, A complete reset",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.lock_outline,
          title: "Passcode",
          trailingText: "OFF",
          trailingColor: Colors.redAccent,
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.payments_outlined,
          title: "Main Currency Setting",
          subtitle: "IDR(Rp)",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.request_quote_outlined,
          title: "Sub Currency Setting",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.notifications_active_outlined,
          title: "Alarm Setting",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.palette_outlined,
          title: "Style",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.rocket_launch_outlined,
          title: "Application Icon",
          isComingSoon: true,
          onTap: () {},
        ),
        _buildListTile(
          context,
          icon: Icons.translate,
          title: "Language Setting",
          isComingSoon: true,
          onTap: () {},
        ),

        const SizedBox(height: 32),
        Center(
          child: TextButton.icon(
            onPressed: () async {
              await AuthService.signOut();
              if (context.mounted) context.go('/login');
            },
            icon: Icon(Icons.logout, size: 20, color: Colors.red[400]),
            label: Text(
              'Sign Out',
              style: AppTextStyles.bodyMedium.copyWith(color: Colors.red[400]),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Text(
        title,
        style: AppTextStyles.caption.copyWith(
          color: context.colors.textSecondary,
        ),
      ),
    );
  }

  Widget _buildListTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    bool isComingSoon = false,
    String? trailingText,
    Color? trailingColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: subtitle != null
              ? CrossAxisAlignment.start
              : CrossAxisAlignment.center,
          children: [
            Icon(icon, color: context.colors.textSecondary, size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        title,
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: context.colors.textPrimary,
                        ),
                      ),
                      if (isComingSoon) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: context.colors.primary.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'Soon',
                            style: AppTextStyles.caption.copyWith(
                              fontSize: 10,
                              color: context.colors.primary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: context.colors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailingText != null)
              Text(
                trailingText,
                style: AppTextStyles.bodySmall.copyWith(
                  color: trailingColor ?? context.colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
