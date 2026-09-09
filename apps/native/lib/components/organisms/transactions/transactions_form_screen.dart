import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
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

class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({super.key, this.transaction});

  /// When non-null the form opens in edit mode for this transaction.
  final Transaction? transaction;

  @override
  ConsumerState<TransactionFormScreen> createState() =>
      _TransactionFormScreenState();
}

class _TransactionFormScreenState
    extends ConsumerState<TransactionFormScreen> {
  // Guards the auto-open below to fire exactly once per screen instance —
  // build() re-runs on every vm change (amount typed, category picked, ...),
  // but initState-style "on open" behavior needs to survive that.
  bool _autoOpenedAmount = false;

  @override
  Widget build(BuildContext context) {
    final vm = ref.watch(transactionFormVmProvider(widget.transaction));
    final palette = context.palette;

    final title = switch (vm.state.type) {
      TransactionType.income => 'Income',
      TransactionType.expense => 'Expense',
      _ => 'Transfer',
    };

    final settings = ref.watch(transactionSettingsProvider).valueOrNull;
    final isAutocomplete = settings?.autocomplete ?? true;
    final isTimeInput = settings?.timeInput != 'None' && settings?.timeInput != null;
    final showDescriptionSetting = settings?.showDescription ?? false;
    final inputOrder = settings?.inputOrder ?? 'Amount';

    // Step-through chain: date -> amount -> (category -> account) or
    // (from -> to) for transfer. Each entity's onSelected both commits the
    // value and opens the next field's drawer, so the user never has to tap
    // the next field themselves — see FormDrawerController.open/close in
    // input_base_drawer_host.dart for why close() runs before opening next.
    final toWalletEntity = EntitySelect<Wallet>(
      sheetTitle: 'To',
      gridColumns: 3,
      value: _firstOrNull(
        vm.walletOptions,
        (w) => w.id == vm.state.toWalletId,
      ),
      items: vm.walletOptions,
      labelOf: (w) => w.name,
      idOf: (w) => w.id,
      onSelected: (w) => vm.setToWallet(w.id),
    );
    final fromWalletEntity = EntitySelect<Wallet>(
      sheetTitle: 'From',
      gridColumns: 3,
      value: _firstOrNull(vm.walletOptions, (w) => w.id == vm.state.walletId),
      items: vm.walletOptions,
      labelOf: (w) => w.name,
      idOf: (w) => w.id,
      onSelected: (w) {
        vm.setWallet(w.id);
        toWalletEntity.open(context, id: 'To', fallbackTitle: 'To');
      },
    );
    final accountEntity = EntitySelect<Wallet>(
      gridColumns: 3,
      value: _firstOrNull(vm.walletOptions, (w) => w.id == vm.state.walletId),
      items: vm.walletOptions,
      labelOf: (w) => w.name,
      idOf: (w) => w.id,
      onSelected: (w) => vm.setWallet(w.id),
    );
    final categoryEntity = EntitySelect<Category>(
      gridColumns: 3,
      leadingOf: (c) => c.emoji,
      value: _firstOrNull(
        vm.categoryOptions,
        (c) => c.id == vm.state.categoryId,
      ),
      items: vm.categoryOptions,
      labelOf: (c) => c.name,
      idOf: (c) => c.id,
      onSelected: (c) {
        vm.setCategory(c.id);
        accountEntity.open(context, id: 'Account', fallbackTitle: 'Account');
      },
    );

    void openAfterAmount() {
      if (vm.state.type == TransactionType.transfer) {
        fromWalletEntity.open(context, id: 'From', fallbackTitle: 'From');
      } else {
        categoryEntity.open(
          context,
          id: 'Category',
          fallbackTitle: 'Category',
        );
      }
    }

    // Auto open first input based on inputOrder setting
    if (!_autoOpenedAmount) {
      _autoOpenedAmount = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final controller = FormDrawerScope.maybeOf(context);
        if (inputOrder == 'Account' || inputOrder == 'Category') {
          openAfterAmount();
        } else {
          controller?.open(
            'Amount',
            (_) => AmountKeypad(
              initial: vm.state.amount,
              title: 'Amount',
              currency: 'IDR',
              workspaceTabs: true,
              onChanged: vm.setAmount,
              onSubmit: (v) {
                controller.close();
                openAfterAmount();
              },
              onClose: controller.close,
            ),
          );
        }
      });
    }

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
                onDateChanged: (d) {
                  vm.setDate(d);
                  if (isTimeInput) {
                    showTimePicker(
                      context: context,
                      initialTime: TimeOfDay.fromDateTime(vm.state.date),
                    ).then((time) {
                      if (time != null) {
                        vm.setDate(
                          DateTime(
                            d.year,
                            d.month,
                            d.day,
                            time.hour,
                            time.minute,
                          ),
                        );
                      }
                    });
                  }
                  openAmountDrawer(
                    context,
                    id: 'Amount',
                    initial: vm.state.amount,
                    workspaceTabs: true,
                    onChanged: vm.setAmount,
                    onSubmitted: (_) => openAfterAmount(),
                  );
                },
                labelPosition: InputLabelPosition.left,
                variant: InputVariant.underline,
              ),

              _AmountRow(vm: vm, onSubmitted: (_) => openAfterAmount()),

              if (vm.state.type == TransactionType.transfer) ...[
                _TransferWalletsRow(
                  vm: vm,
                  fromEntity: fromWalletEntity,
                  toEntity: toWalletEntity,
                ),
              ] else ...[
                Input(
                  context: InputContext.select,
                  label: 'Category',
                  placeholder: 'Choose a category',
                  labelPosition: InputLabelPosition.left,
                  variant: InputVariant.underline,
                  entity: categoryEntity,
                ),
                Input(
                  context: InputContext.select,
                  label: 'Account',
                  placeholder: 'Choose an account',
                  entity: accountEntity,
                ),
              ],
              FormFieldRow(
                label: 'Description',
                child: isAutocomplete
                    ? Autocomplete<String>(
                        initialValue: TextEditingValue(text: vm.state.note),
                        optionsBuilder: (textEditingValue) {
                          if (textEditingValue.text.isEmpty) {
                            return const Iterable<String>.empty();
                          }
                          final history = vm.transactionsHistory
                              .map((t) => t.name ?? t.description ?? '')
                              .where((s) => s.isNotEmpty)
                              .toSet()
                              .toList();
                          return history.where((opt) => opt
                              .toLowerCase()
                              .contains(textEditingValue.text.toLowerCase()));
                        },
                        onSelected: vm.setNote,
                        fieldViewBuilder:
                            (context, textController, focusNode, onFieldSubmitted) {
                          return TextField(
                            controller: textController,
                            focusNode: focusNode,
                            onChanged: vm.setNote,
                            onTap: () =>
                                FormDrawerScope.maybeOf(context)?.close(),
                            style: OewangFonts.sans(
                              color: palette.foreground,
                              fontSize: 14,
                            ),
                            decoration: InputDecoration(
                              isDense: true,
                              border: UnderlineInputBorder(
                                borderSide: BorderSide(color: palette.border),
                              ),
                              enabledBorder: UnderlineInputBorder(
                                borderSide: BorderSide(color: palette.border),
                              ),
                              focusedBorder: UnderlineInputBorder(
                                borderSide: BorderSide(color: palette.primary),
                              ),
                            ),
                          );
                        },
                      )
                    : Input(
                        variant: InputVariant.underline,
                        controller: TextEditingController(text: vm.state.note)
                          ..selection = TextSelection.collapsed(
                            offset: vm.state.note.length,
                          ),
                        onChanged: vm.setNote,
                        onTap: () => FormDrawerScope.maybeOf(context)?.close(),
                      ),
              ),
              if (showDescriptionSetting) ...[
                const SizedBox(height: 24),
                Container(height: 8, color: palette.muted),
                _DescriptionRow(vm: vm),
              ],
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
  const _AmountRow({required this.vm, this.onSubmitted});
  final TransactionFormViewModel vm;

  /// Fires once the keypad's OK is tapped — the parent uses this to open the
  /// next field's drawer (category/account, or from/to for a transfer).
  final ValueChanged<num>? onSubmitted;

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
      onAmountSubmitted: onSubmitted,
    );
  }
}

class _TransferWalletsRow extends StatelessWidget {
  const _TransferWalletsRow({
    required this.vm,
    required this.fromEntity,
    required this.toEntity,
  });
  final TransactionFormViewModel vm;
  final EntitySelect<Wallet> fromEntity;
  final EntitySelect<Wallet> toEntity;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

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
                entity: fromEntity,
              ),
              Input(
                context: InputContext.select,
                label: 'To',
                placeholder: 'Choose an account',
                entity: toEntity,
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
                  hintText: 'Note (optional)',
                  variant: InputVariant.underline,
                  maxLines: 5,
                  minLines: 3,
                  controller: TextEditingController(text: widget.vm.state.description)
                    ..selection = TextSelection.collapsed(
                      offset: widget.vm.state.description.length,
                    ),
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
