import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/ui/core/form/amount_input_field.dart';
import 'package:oewang/ui/core/form/form_drawer.dart';
import 'package:oewang/ui/core/form/form_field_row.dart';
import 'package:oewang/ui/core/form/select_date_field.dart';
import 'package:oewang/ui/core/form/select_entity_field.dart';
import 'package:oewang/ui/core/page_app_bar.dart';
import 'package:oewang/ui/transactions/view_models/transaction_form_view_model.dart';
import 'package:oewang/ui/transactions/widgets/segmented_pill_tabs.dart';

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
    final tx = Theme.of(context).extension<TransactionColors>()!;
    final palette = context.palette;
    final saveTint = switch (vm.state.type) {
      TransactionType.income => tx.income,
      TransactionType.expense => tx.expense,
      _ => palette.foreground,
    };

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
              SegmentedPillTabs(
              selected: vm.state.type,
              onChanged: vm.setType,
            ),
            Divider(height: 1, color: palette.border),
            SelectDateField(
              value: vm.state.date,
              onChanged: vm.setDate,
            ),
            Divider(height: 1, color: palette.border),
            _AmountRow(vm: vm),
            Divider(height: 1, color: palette.border),
            if (vm.state.type == TransactionType.transfer) ...[
              _TransferWalletsRow(vm: vm),
              Divider(height: 1, color: palette.border),
            ] else ...[
              SelectEntityField<Category>(
                label: 'Category',
                placeholder: 'Choose a category',
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
              Divider(height: 1, color: palette.border),
              SelectEntityField<Wallet>(
                label: 'Account',
                placeholder: 'Choose an account',
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
              Divider(height: 1, color: palette.border),
            ],
            _NoteRow(vm: vm),
            const SizedBox(height: 24),
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
            _ActionRow(vm: vm, saveTint: saveTint),
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
    final isTransfer = vm.state.type == TransactionType.transfer;

    return AmountInputField(
      label: 'Amount',
      value: vm.state.amount,
      valueColor: color,
      onChanged: vm.setAmount,
      trailing: isTransfer
          ? OutlinedButton(
              onPressed: () => openAmountDrawer(
                context,
                id: 'Fees',
                initial: vm.state.fees,
                title: 'Fees',
                onChanged: vm.setFees,
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: vm.state.fees > 0
                    ? palette.foreground
                    : palette.mutedForeground,
                side: BorderSide(color: palette.border),
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.zero,
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                minimumSize: Size.zero,
              ),
              child: Text(
                vm.state.fees > 0
                    ? 'Fees ${AmountFormat.number(vm.state.fees)}'
                    : 'Fees',
                style: OewangFonts.sans(fontSize: 13),
              ),
            )
          : null,
    );
  }
}

class _TransferWalletsRow extends StatelessWidget {
  const _TransferWalletsRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final from = _firstOrNull(vm.walletOptions, (w) => w.id == vm.state.walletId);
    final to = _firstOrNull(vm.walletOptions, (w) => w.id == vm.state.toWalletId);

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SelectEntityField<Wallet>(
                label: 'From',
                placeholder: 'Choose an account',
                gridColumns: 3,
                value: from,
                items: vm.walletOptions,
                labelOf: (w) => w.name,
                idOf: (w) => w.id,
                onSelected: (w) => vm.setWallet(w.id),
              ),
              Divider(height: 1, color: palette.border),
              SelectEntityField<Wallet>(
                label: 'To',
                placeholder: 'Choose an account',
                gridColumns: 3,
                value: to,
                items: vm.walletOptions,
                labelOf: (w) => w.name,
                idOf: (w) => w.id,
                onSelected: (w) => vm.setToWallet(w.id),
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

class _NoteRow extends StatelessWidget {
  const _NoteRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    return FormFieldRow(
      label: 'Note',
      child: TextField(
        onTap: () => FormDrawerScope.maybeOf(context)?.close(),
        onChanged: vm.setNote,
        decoration: const InputDecoration(
          hintText: '',
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: EdgeInsets.zero,
          fillColor: Colors.transparent,
          filled: false,
        ),
        style: OewangFonts.sans(color: context.palette.foreground),
      ),
    );
  }
}

class _DescriptionRow extends StatelessWidget {
  const _DescriptionRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      color: palette.card,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              onTap: () => FormDrawerScope.maybeOf(context)?.close(),
              onChanged: vm.setDescription,
              decoration: InputDecoration(
                hintText: 'Description',
                hintStyle: OewangFonts.sans(
                  color: palette.mutedForeground,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                fillColor: Colors.transparent,
                filled: false,
              ),
              style: OewangFonts.sans(color: palette.foreground),
            ),
          ),
          Icon(Icons.photo_camera_outlined, color: palette.mutedForeground),
        ],
      ),
    );
  }
}

class _ActionRow extends ConsumerWidget {
  const _ActionRow({required this.vm, required this.saveTint});

  final TransactionFormViewModel vm;
  final Color saveTint;

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
      (_) {/* error rendered by VM */},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: saveTint,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.zero,
                  ),
                ),
                onPressed: vm.canSave
                    ? () => _onSave(context, ref, keepOpen: false)
                    : null,
                child: vm.save.running
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        'Save',
                        style: OewangFonts.sans(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            height: 48,
            child: OutlinedButton(
              onPressed: vm.canSave
                  ? () => _onSave(context, ref, keepOpen: true)
                  : null,
              style: OutlinedButton.styleFrom(
                foregroundColor: palette.foreground,
                side: BorderSide(color: palette.border),
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.zero,
                ),
              ),
              child: Text('Continue', style: OewangFonts.sans(fontSize: 15)),
            ),
          ),
        ],
      ),
    );
  }
}
