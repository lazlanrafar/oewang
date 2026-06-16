import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/ui/transactions/view_models/transaction_form_view_model.dart';
import 'package:oewang/ui/transactions/widgets/amount_calculator_sheet.dart';
import 'package:oewang/ui/transactions/widgets/entity_picker_sheet.dart';
import 'package:oewang/ui/transactions/widgets/segmented_pill_tabs.dart';

final transactionFormVmProvider =
    ChangeNotifierProvider.autoDispose<TransactionFormViewModel>(
      (ref) => TransactionFormViewModel(
        transactions: ref.watch(transactionsRepositoryProvider),
        wallets: ref.watch(walletsRepositoryProvider),
        categories: ref.watch(categoriesRepositoryProvider),
      ),
    );

class TransactionFormScreen extends ConsumerWidget {
  const TransactionFormScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(transactionFormVmProvider);
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
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Trans.'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 110,
        title: Text(title, style: OewangFonts.sans(fontSize: 17)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Icon(Icons.star_border, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            SegmentedPillTabs(
              selected: vm.state.type,
              onChanged: vm.setType,
            ),
            Divider(height: 1, color: palette.border),
            _DateRow(vm: vm),
            Divider(height: 1, color: palette.border),
            _AmountRow(vm: vm),
            Divider(height: 1, color: palette.border),
            if (vm.state.type == TransactionType.transfer) ...[
              _TransferWalletsRow(vm: vm),
              Divider(height: 1, color: palette.border),
            ] else ...[
              _CategoryRow(vm: vm),
              Divider(height: 1, color: palette.border),
              _AccountRow(vm: vm),
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
    );
  }
}

class _LabelledRow extends StatelessWidget {
  const _LabelledRow({required this.label, required this.child});
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
            width: 84,
            child: Text(
              label,
              style: OewangFonts.sans(color: context.palette.mutedForeground),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _DateRow extends StatelessWidget {
  const _DateRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final formatted =
        DateFormat('EEE, dd/MM/yyyy').format(vm.state.date);
    return _LabelledRow(
      label: 'Date',
      child: InkWell(
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            initialDate: vm.state.date,
            firstDate: DateTime(2000),
            lastDate: DateTime(2100),
          );
          if (picked != null) vm.setDate(picked);
        },
        child: Text(
          formatted,
          style: OewangFonts.sans(color: context.palette.foreground),
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
    final color = vm.state.type == TransactionType.income
        ? tx.income
        : (vm.state.type == TransactionType.expense
              ? tx.expense
              : palette.foreground);
    final isTransfer = vm.state.type == TransactionType.transfer;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 84,
            child: Text(
              'Amount',
              style: OewangFonts.sans(color: palette.mutedForeground),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: () async {
                final result = await AmountCalculatorSheet.show(
                  context,
                  initial: vm.state.amount,
                );
                if (result != null) vm.setAmount(result);
              },
              child: Text(
                Money(amount: vm.state.amount).format(),
                style: OewangFonts.currency(color: color, fontSize: 16),
              ),
            ),
          ),
          if (isTransfer)
            OutlinedButton(
              onPressed: () async {
                final value = await AmountCalculatorSheet.show(
                  context,
                  initial: vm.state.fees,
                );
                if (value != null) vm.setFees(value);
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: vm.state.fees > 0
                    ? palette.foreground
                    : palette.mutedForeground,
                side: BorderSide(color: palette.border),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                minimumSize: Size.zero,
              ),
              child: Text(
                vm.state.fees > 0
                    ? 'Fees ${vm.state.fees}'
                    : 'Fees',
                style: OewangFonts.sans(fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final selected = vm.categoryOptions.where(
      (c) => c.id == vm.state.categoryId,
    );
    final label = selected.isEmpty ? '' : selected.first.name;
    return _LabelledRow(
      label: 'Category',
      child: InkWell(
        onTap: () async {
          final picked = await EntityPickerSheet.show<Category>(
            context,
            title: 'Category',
            items: vm.categoryOptions,
            labelOf: (c) => c.name,
            idOf: (c) => c.id,
          );
          if (picked != null) vm.setCategory(picked.id);
        },
        child: Text(
          label.isEmpty ? 'Choose a category' : label,
          style: OewangFonts.sans(
            color: label.isEmpty
                ? palette.mutedForeground
                : palette.foreground,
          ),
        ),
      ),
    );
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final selected = vm.walletOptions.where((w) => w.id == vm.state.walletId);
    final label = selected.isEmpty ? '' : selected.first.name;
    return _LabelledRow(
      label: 'Account',
      child: InkWell(
        onTap: () async {
          final picked = await EntityPickerSheet.show<Wallet>(
            context,
            title: 'Account',
            items: vm.walletOptions,
            labelOf: (w) => w.name,
            idOf: (w) => w.id,
          );
          if (picked != null) vm.setWallet(picked.id);
        },
        child: Text(
          label.isEmpty ? 'Choose an account' : label,
          style: OewangFonts.sans(
            color: label.isEmpty
                ? palette.mutedForeground
                : palette.foreground,
          ),
        ),
      ),
    );
  }
}

class _TransferWalletsRow extends StatelessWidget {
  const _TransferWalletsRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final from = vm.walletOptions
        .where((w) => w.id == vm.state.walletId)
        .map((w) => w.name)
        .firstOrNull;
    final to = vm.walletOptions
        .where((w) => w.id == vm.state.toWalletId)
        .map((w) => w.name)
        .firstOrNull;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _PickRow(
                  label: 'From',
                  value: from,
                  onTap: () async {
                    final picked = await EntityPickerSheet.show<Wallet>(
                      context,
                      title: 'From',
                      items: vm.walletOptions,
                      labelOf: (w) => w.name,
                      idOf: (w) => w.id,
                    );
                    if (picked != null) vm.setWallet(picked.id);
                  },
                ),
                Divider(height: 1, color: palette.border),
                _PickRow(
                  label: 'To',
                  value: to,
                  onTap: () async {
                    final picked = await EntityPickerSheet.show<Wallet>(
                      context,
                      title: 'To',
                      items: vm.walletOptions,
                      labelOf: (w) => w.name,
                      idOf: (w) => w.id,
                    );
                    if (picked != null) vm.setToWallet(picked.id);
                  },
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
      ),
    );
  }
}

class _PickRow extends StatelessWidget {
  const _PickRow({required this.label, required this.value, required this.onTap});

  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 84,
              child: Text(
                label,
                style: OewangFonts.sans(color: palette.mutedForeground),
              ),
            ),
            Expanded(
              child: Text(
                value ?? 'Choose an account',
                style: OewangFonts.sans(
                  color: value == null
                      ? palette.mutedForeground
                      : palette.foreground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoteRow extends StatelessWidget {
  const _NoteRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  Widget build(BuildContext context) {
    return _LabelledRow(
      label: 'Note',
      child: TextField(
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
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(OewangRadius.lg),
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
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(OewangRadius.lg),
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
