import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_view_model.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

final accountFormVmProvider = ChangeNotifierProvider.autoDispose
    .family<AccountFormViewModel, Wallet?>(
      (ref, editing) => AccountFormViewModel(
        wallets: ref.watch(walletsRepositoryProvider),
        groups: ref.watch(walletGroupsRepositoryProvider),
        subCurrencies: ref.watch(subCurrenciesRepositoryProvider),
        editing: editing,
      ),
    );

/// Returns the first element matching [test], or `null`.
T? _firstOrNull<T>(Iterable<T> items, bool Function(T) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}

/// IMG_1836 — create/edit wallet form. Description is captured locally but
/// dropped on save (the API doesn't accept it).
class AccountFormScreen extends ConsumerStatefulWidget {
  const AccountFormScreen({super.key, this.wallet});

  /// When non-null the form opens in edit mode for this wallet.
  final Wallet? wallet;

  @override
  ConsumerState<AccountFormScreen> createState() => _AccountFormScreenState();
}

class _AccountFormScreenState extends ConsumerState<AccountFormScreen> {
  static const _labelWidth = 100.0;

  late final TextEditingController _nameCtl;

  @override
  void initState() {
    super.initState();
    final vm = ref.read(accountFormVmProvider(widget.wallet));
    _nameCtl = TextEditingController(text: vm.state.name);
  }

  @override
  void dispose() {
    _nameCtl.dispose();
    super.dispose();
  }

  Future<void> _onSave() async {
    final vm = ref.read(accountFormVmProvider(widget.wallet));
    final res = await vm.submit();
    if (res == null || !mounted) return;
    res.fold(
      (_) {
        ref.read(walletsRevisionProvider.notifier).bump();
        Navigator.of(context).pop(true);
      },
      (_) {/* error rendered via VM */},
    );
  }

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(accountFormVmProvider(widget.wallet));

    return Scaffold(
      appBar: PageAppBar(
        title: vm.isEditing ? 'Edit' : 'Add',
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
                  Input(
                    context: InputContext.select,
                    label: 'Group',
                    variant: InputVariant.underline,
                    labelWidth: _labelWidth,
                    placeholder: 'Choose a group',
                    entity: EntitySelect<WalletGroup>(
                      gridColumns: 3,
                      value: _firstOrNull(
                        vm.groupOptions,
                        (g) => g.id == vm.state.groupId,
                      ),
                      items: vm.groupOptions,
                      labelOf: (g) => g.name,
                      idOf: (g) => g.id,
                      onSelected: (g) => vm.setGroup(g.id),
                    ),
                  ),
                  FormFieldRow(
                    label: 'Name',
                    labelWidth: _labelWidth,
                    child: Input(
                      controller: _nameCtl,
                      variant: InputVariant.underline,
                      onChanged: vm.setName,
                      onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                    ),
                  ),
                  Input(
                    context: InputContext.currency,
                    label: 'Amount',
                    variant: InputVariant.underline,
                    labelWidth: _labelWidth,
                    amount: vm.state.balance,
                    onAmountChanged: vm.setBalance,
                    currency: vm.state.currencyCode,
                    useCurrencyCode: true,
                    showCurrencyTabs: false,
                  ),
                  FormFieldRow(
                    label: 'Currency',
                    labelWidth: _labelWidth,
                    underline: true,
                    child: _CurrencyPicker(vm: vm),
                  ),
                  FormFieldRow(
                    label: 'Description',
                    labelWidth: _labelWidth,
                    child: Input(
                      variant: InputVariant.underline,
                      onChanged: vm.setDescription,
                      onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                    ),
                  ),
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
                onPressed: vm.canSave ? _onSave : null,
              ),
            ),
          ],
          ),
        ),
      ),
    );
  }
}

/// Main + sub currency toggle (main selected by default). Flat square chips
/// in the foreground colour — no rounded corners, no accent red.
class _CurrencyPicker extends StatelessWidget {
  const _CurrencyPicker({required this.vm});
  final AccountFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Row(
      children: [
        for (final c in vm.currencyOptions)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () {
                FocusManager.instance.primaryFocus?.unfocus();
                FormDrawerScope.maybeOf(context)?.close();
                vm.setCurrency(c.code);
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: vm.state.currencyCode == c.code
                      ? palette.foreground.withValues(alpha: 0.06)
                      : null,
                  border: Border.all(
                    color: vm.state.currencyCode == c.code
                        ? palette.foreground
                        : palette.border,
                  ),
                ),
                child: Text(
                  c.code,
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 13,
                    fontWeight: vm.state.currencyCode == c.code
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
