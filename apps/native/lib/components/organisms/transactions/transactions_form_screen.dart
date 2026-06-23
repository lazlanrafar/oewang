import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_view_model.dart';
import 'package:oewang/components/organisms/transactions/transactions_segmented_pill_tabs.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';

final transactionFormVmProvider = ChangeNotifierProvider.autoDispose
    .family<TransactionFormViewModel, Transaction?>(
      (ref, editing) => TransactionFormViewModel(
        transactions: ref.watch(transactionsRepositoryProvider),
        wallets: ref.watch(walletsRepositoryProvider),
        categories: ref.watch(categoriesRepositoryProvider),
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

class TransactionFormScreen extends ConsumerWidget {
  const TransactionFormScreen({super.key, this.transaction});

  /// When non-null the form opens in edit mode for this transaction.
  final Transaction? transaction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(transactionFormVmProvider(transaction));
    final palette = context.palette;

    final title = switch (vm.state.type) {
      TransactionType.income => 'Income',
      TransactionType.expense => 'Expense',
      _ => 'Transfer',
    };

    return Scaffold(
      appBar: PageAppBar(
        title: title,
        backLabel: 'Trans.',
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Icon(Icons.star_border, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              SegmentedPillTabs(selected: vm.state.type, onChanged: vm.setType),
              Divider(height: 1, color: palette.border),
              Input(
                context: InputContext.date,
                date: vm.state.date,
                onDateChanged: vm.setDate,
                labelPosition: InputLabelPosition.left,
                variant: InputVariant.underline,
              ),

              _AmountRow(vm: vm),

              if (vm.state.type == TransactionType.transfer) ...[
                _TransferWalletsRow(vm: vm),
              ] else ...[
                Input(
                  context: InputContext.select,
                  label: 'Category',
                  placeholder: 'Choose a category',
                  labelPosition: InputLabelPosition.left,
                  variant: InputVariant.underline,
                  entity: EntitySelect<Category>(
                    gridColumns: 3,
                    leadingOf: (c) => c.emoji,
                    value: _firstOrNull(
                      vm.categoryOptions,
                      (c) => c.id == vm.state.categoryId,
                    ),
                    items: vm.categoryOptions,
                    labelOf: (c) => c.name,
                    idOf: (c) => c.id,
                    onSelected: (c) => vm.setCategory(c.id),
                  ),
                ),
                Input(
                  context: InputContext.select,
                  label: 'Account',
                  placeholder: 'Choose an account',
                  entity: EntitySelect<Wallet>(
                    gridColumns: 3,
                    value: _firstOrNull(
                      vm.walletOptions,
                      (w) => w.id == vm.state.walletId,
                    ),
                    items: vm.walletOptions,
                    labelOf: (w) => w.name,
                    idOf: (w) => w.id,
                    onSelected: (w) => vm.setWallet(w.id),
                  ),
                ),
              ],
              FormFieldRow(
                label: 'Note',
                child: Input(
                  variant: InputVariant.underline,
                  onChanged: vm.setNote,
                  onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                ),
              ),
              const SizedBox(height: 24),
              Container(height: 8, color: palette.muted),
              _DescriptionRow(vm: vm),
              const SizedBox(height: 12),
              if (vm.save.error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    vm.save.error!.message,
                    textAlign: TextAlign.center,
                    style: OewangFonts.sans(color: OewangColors.coral),
                  ),
                ),
              _ActionRow(vm: vm),
            ],
          ),
        ),
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    final color = switch (vm.state.type) {
      TransactionType.income => tx.income,
      TransactionType.expense => tx.expense,
      _ => palette.foreground,
    };

    return Input(
      context: InputContext.currency,
      label: 'Amount',
      amount: vm.state.amount,
      valueColor: color,
      onAmountChanged: vm.setAmount,
    );
  }
}

class _TransferWalletsRow extends StatelessWidget {
  const _TransferWalletsRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final from = _firstOrNull(
      vm.walletOptions,
      (w) => w.id == vm.state.walletId,
    );
    final to = _firstOrNull(
      vm.walletOptions,
      (w) => w.id == vm.state.toWalletId,
    );

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Input(
                context: InputContext.select,
                label: 'From',
                placeholder: 'Choose an account',
                entity: EntitySelect<Wallet>(
                  gridColumns: 3,
                  value: from,
                  items: vm.walletOptions,
                  labelOf: (w) => w.name,
                  idOf: (w) => w.id,
                  onSelected: (w) => vm.setWallet(w.id),
                ),
              ),
              Input(
                context: InputContext.select,
                label: 'To',
                placeholder: 'Choose an account',
                entity: EntitySelect<Wallet>(
                  gridColumns: 3,
                  value: to,
                  items: vm.walletOptions,
                  labelOf: (w) => w.name,
                  idOf: (w) => w.id,
                  onSelected: (w) => vm.setToWallet(w.id),
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Swap',
          onPressed: vm.swapWallets,
          icon: Icon(Icons.swap_vert, color: palette.mutedForeground),
        ),
      ],
    );
  }
}

/// Multi-line description (variant-styled [Input]) plus a receipt image
/// attachment. ponytail: the picked receipt is preview-only — there's no
/// transaction attachment endpoint yet (only `POST /users/me/avatar`). Wire it
/// to a multipart POST + a `receiptUrl` field on the draft when the API lands.
class _DescriptionRow extends StatefulWidget {
  const _DescriptionRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  State<_DescriptionRow> createState() => _DescriptionRowState();
}

class _DescriptionRowState extends State<_DescriptionRow> {
  XFile? _receipt;

  Future<void> _pickReceipt() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;
    setState(() => _receipt = picked);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Input(
                  hintText: 'Description',
                  variant: InputVariant.underline,
                  maxLines: 5,
                  minLines: 3,
                  onChanged: widget.vm.setDescription,
                  onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                ),
              ),
              IconButton(
                onPressed: _pickReceipt,
                tooltip: 'Attach receipt',
                icon: Icon(
                  Icons.photo_camera_outlined,
                  color: palette.mutedForeground,
                ),
              ),
            ],
          ),
          if (_receipt != null) ...[
            const SizedBox(height: 8),
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(_receipt!.path),
                    width: 96,
                    height: 96,
                    fit: BoxFit.cover,
                  ),
                ),
                Positioned(
                  top: -8,
                  right: -8,
                  child: IconButton(
                    onPressed: () => setState(() => _receipt = null),
                    icon: Icon(Icons.cancel, color: palette.foreground),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionRow extends ConsumerWidget {
  const _ActionRow({required this.vm});

  final TransactionFormViewModel vm;

  Future<void> _onSave(
    BuildContext context,
    WidgetRef ref, {
    required bool keepOpen,
  }) async {
    final res = await vm.submit();
    if (res == null || !context.mounted) return;
    res.fold(
      (_) {
        ref.read(transactionsRevisionProvider.notifier).bump();
        if (keepOpen) {
          vm.resetForContinue();
        } else {
          Navigator.of(context).pop(true);
        }
      },
      (_) {
        /* error rendered by VM */
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Expanded(
            child: Button(
              label: 'Save',
              height: 48,
              loading: vm.save.running,
              onPressed: vm.canSave
                  ? () => _onSave(context, ref, keepOpen: false)
                  : null,
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 130,
            child: Button(
              label: 'Continue',
              height: 48,
              variant: ButtonVariant.outlined,
              onPressed: vm.canSave
                  ? () => _onSave(context, ref, keepOpen: true)
                  : null,
            ),
          ),
        ],
      ),
    );
  }
}
