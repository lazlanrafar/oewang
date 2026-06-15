import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet_group.dart';
import 'package:oewang/ui/transactions/widgets/amount_calculator_sheet.dart';
import 'package:oewang/ui/transactions/widgets/entity_picker_sheet.dart';
import 'package:oewang/ui/wallets/view_models/account_form_view_model.dart';

final accountFormVmProvider =
    ChangeNotifierProvider.autoDispose<AccountFormViewModel>(
      (ref) => AccountFormViewModel(
        wallets: ref.watch(walletsRepositoryProvider),
        groups: ref.watch(walletGroupsRepositoryProvider),
      ),
    );

/// IMG_1836 — minimal create-wallet form. Description is captured locally but
/// dropped on save (the API doesn't accept it).
class AccountFormScreen extends ConsumerWidget {
  const AccountFormScreen({super.key});

  Future<void> _onSave(BuildContext context, WidgetRef ref) async {
    final vm = ref.read(accountFormVmProvider);
    final res = await vm.submit();
    if (res == null || !context.mounted) return;
    res.fold(
      (_) {
        ref.read(walletsRevisionProvider.notifier).bump();
        Navigator.of(context).pop(true);
      },
      (_) {/* error rendered via VM */},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(accountFormVmProvider);
    final selectedGroupName = vm.groupOptions
        .where((g) => g.id == vm.state.groupId)
        .map((g) => g.name)
        .firstOrNull;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Accounts'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text('Add', style: OewangFonts.sans(fontSize: 17)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _Row(
                    label: 'Group',
                    child: InkWell(
                      onTap: () async {
                        final picked = await EntityPickerSheet.show<WalletGroup>(
                          context,
                          title: 'Group',
                          items: vm.groupOptions,
                          labelOf: (g) => g.name,
                          idOf: (g) => g.id,
                        );
                        if (picked != null) vm.setGroup(picked.id);
                      },
                      child: Text(
                        selectedGroupName ?? 'Choose a group',
                        style: OewangFonts.sans(
                          color: selectedGroupName == null
                              ? OewangColors.mutedForeground
                              : OewangColors.foreground,
                        ),
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: OewangColors.border),
                  _Row(
                    label: 'Name',
                    child: TextField(
                      onChanged: vm.setName,
                      decoration: const InputDecoration(
                        hintText: '',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        fillColor: Colors.transparent,
                        filled: false,
                      ),
                      style: OewangFonts.sans(),
                    ),
                  ),
                  const Divider(height: 1, color: OewangColors.border),
                  _Row(
                    label: 'Amount',
                    child: InkWell(
                      onTap: () async {
                        final value = await AmountCalculatorSheet.show(
                          context,
                          initial: vm.state.balance,
                        );
                        if (value != null) vm.setBalance(value);
                      },
                      child: Text(
                        Money(amount: vm.state.balance).format(),
                        style: OewangFonts.currency(fontSize: 16),
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: OewangColors.border),
                  _Row(
                    label: 'Description',
                    child: TextField(
                      onChanged: vm.setDescription,
                      decoration: const InputDecoration(
                        hintText: '',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        fillColor: Colors.transparent,
                        filled: false,
                      ),
                      style: OewangFonts.sans(),
                    ),
                  ),
                  const Divider(height: 1, color: OewangColors.border),
                  if (vm.save.error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: Text(
                        vm.save.error!.message,
                        textAlign: TextAlign.center,
                        style: OewangFonts.sans(color: OewangColors.coral),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: OewangColors.coral,
                    foregroundColor: OewangColors.foreground,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(OewangRadius.lg),
                    ),
                  ),
                  onPressed: vm.canSave
                      ? () => _onSave(context, ref)
                      : null,
                  child: vm.save.running
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: OewangColors.foreground,
                          ),
                        )
                      : Text(
                          'Save',
                          style: OewangFonts.sans(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: OewangFonts.sans(color: OewangColors.mutedForeground),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}
