import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/ui/core/page_app_bar.dart';

/// IMG_2252 — informational empty state.
class TransferExpenseSettingScreen extends StatelessWidget {
  const TransferExpenseSettingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      appBar: const PageAppBar(
        title: 'Transfer-Expense setting',
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Amount transferred from the regular account to the selected '
                'account is shown as an expense on the Trans tab and the Stats '
                'tab. This is a feature that displays the transferred amount '
                'as an expense to the accounts that are difficult to '
                'liquidate, such as savings, investments, loans, and '
                'insurance. This is not applicable to cash/bank/card/check '
                'card account groups. The transferred amount from the '
                'selected account to the regular account will be displayed '
                'as an income.',
                style: OewangFonts.sans(
                  color: palette.mutedForeground,
                  fontSize: 12,
                ),
              ),
            ),
            Divider(height: 1, color: palette.border),
            const Spacer(),
            Column(
              children: [
                Icon(Icons.pets, size: 56, color: palette.mutedForeground),
                const SizedBox(height: 8),
                Text(
                  'No data available.',
                  style: OewangFonts.sans(color: palette.mutedForeground),
                ),
              ],
            ),
            const Spacer(flex: 2),
          ],
        ),
      ),
    );
  }
}
