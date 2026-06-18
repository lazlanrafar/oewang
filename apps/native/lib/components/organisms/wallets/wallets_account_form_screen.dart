import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet_group.dart';
import 'package:oewang/ui/core/button.dart';
import 'package:oewang/ui/core/form/amount_input_field.dart';
import 'package:oewang/ui/core/form/form_drawer.dart';
import 'package:oewang/ui/core/form/form_field_row.dart';
import 'package:oewang/ui/core/form/select_entity_field.dart';
import 'package:oewang/ui/core/page_app_bar.dart';
import 'package:oewang/ui/wallets/view_models/account_form_view_model.dart';

final accountFormVmProvider =
    ChangeNotifierProvider.autoDispose<AccountFormViewModel>(
      (ref) => AccountFormViewModel(
        wallets: ref.watch(walletsRepositoryProvider),
        groups: ref.watch(walletGroupsRepositoryProvider),
      ),
    );

/// Returns the first element matching [test], or `null`.
T? _firstOrNull<T>(Iterable<T> items, bool Function(T) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}

/// IMG_1836 — minimal create-wallet form. Description is captured locally but
/// dropped on save (the API doesn't accept it).
class AccountFormScreen extends ConsumerWidget {
  const AccountFormScreen({super.key});

  static const _labelWidth = 100.0;

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
    final palette = context.palette;

    return Scaffold(
      appBar: const PageAppBar(
        title: 'Add',
        backLabel: 'Accounts',
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  SelectEntityField<WalletGroup>(
                    label: 'Group',
                    labelWidth: _labelWidth,
                    gridColumns: 3,
                    placeholder: 'Choose a group',
                    value: _firstOrNull(
                      vm.groupOptions,
                      (g) => g.id == vm.state.groupId,
                    ),
                    items: vm.groupOptions,
                    labelOf: (g) => g.name,
                    idOf: (g) => g.id,
                    onSelected: (g) => vm.setGroup(g.id),
                  ),
                  Divider(height: 1, color: palette.border),
                  FormFieldRow(
                    label: 'Name',
                    labelWidth: _labelWidth,
                    child: TextField(
                      onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                      onChanged: vm.setName,
                      decoration: const InputDecoration(
                        hintText: '',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        fillColor: Colors.transparent,
                        filled: false,
                      ),
                      style: OewangFonts.sans(color: palette.foreground),
                    ),
                  ),
                  Divider(height: 1, color: palette.border),
                  AmountInputField(
                    label: 'Amount',
                    labelWidth: _labelWidth,
                    value: vm.state.balance,
                    onChanged: vm.setBalance,
                  ),
                  Divider(height: 1, color: palette.border),
                  FormFieldRow(
                    label: 'Description',
                    labelWidth: _labelWidth,
                    child: TextField(
                      onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                      onChanged: vm.setDescription,
                      decoration: const InputDecoration(
                        hintText: '',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        fillColor: Colors.transparent,
                        filled: false,
                      ),
                      style: OewangFonts.sans(color: palette.foreground),
                    ),
                  ),
                  Divider(height: 1, color: palette.border),
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
              child: Button(
                label: 'Save',
                loading: vm.save.running,
                onPressed: vm.canSave ? () => _onSave(context, ref) : null,
              ),
            ),
          ],
          ),
        ),
      ),
    );
  }
}
