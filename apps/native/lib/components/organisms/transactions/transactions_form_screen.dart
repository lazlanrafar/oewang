import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_field_row.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/atoms/section_label.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_view_model.dart';
import 'package:oewang/components/organisms/transactions/transactions_segmented_pill_tabs.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
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
        vault: ref.watch(vaultRepositoryProvider),
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

  // Set when the user reaches the end of Amount before wallets/categories
  // have finished loading. A grid picker's item list is frozen at the moment
  // `.open()` is called — opening it while `vm.loadingPickers` is still true
  // would show an empty grid that never fills in once the data arrives, since
  // nothing re-opens it. Instead we wait and open once loading finishes.
  bool _pendingAdvanceFromAmount = false;

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
    final inputOrder = settings?.inputOrder ?? 'Amount';

    return Scaffold(
      appBar: PageAppBar(title: title, backLabel: 'Trans.'),
      body: SafeArea(
        child: FormDrawerHost(
          // A Builder here (below FormDrawerHost/FormDrawerScope in the tree)
          // gives this `context` — shadowing the outer build(context) — the
          // descendant relationship FormDrawerScope.maybeOf needs. The outer
          // context is an ancestor of FormDrawerHost, so using it for any
          // .open()/openAmountDrawer() call below would silently no-op.
          child: Builder(
            builder: (context) {
              // Step-through chain: date -> amount -> (category -> account) or
              // (from -> to) for transfer. Each entity's onSelected both commits
              // the value and opens the next field's drawer, so the user never
              // has to tap the next field themselves — see
              // FormDrawerController.open/close in input_base_drawer_host.dart
              // for why close() runs before opening next.
              //
              // These are FUNCTIONS, not values, so every `.open()` call below
              // reads `vm.walletOptions`/`vm.categoryOptions` live at the
              // moment it's invoked. The auto-advance calls (openAfterAmount,
              // the onSelected chain, the auto-opened keypad's onSubmit) are
              // all stored inside a drawer's builder closure the first time it
              // opens and reused unchanged on every later rebuild — a `final`
              // entity captured then would freeze whatever wallets/categories
              // had loaded (or hadn't) at that instant.
              EntitySelect<Wallet> toWalletEntity() => EntitySelect<Wallet>(
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
              EntitySelect<Wallet> fromWalletEntity() => EntitySelect<Wallet>(
                sheetTitle: 'From',
                gridColumns: 3,
                value: _firstOrNull(
                  vm.walletOptions,
                  (w) => w.id == vm.state.walletId,
                ),
                items: vm.walletOptions,
                labelOf: (w) => w.name,
                idOf: (w) => w.id,
                onSelected: (w) {
                  vm.setWallet(w.id);
                  // Only step-through chain on the initial fill — re-picking
                  // From on an already-filled form shouldn't reopen To.
                  if (vm.state.toWalletId == null) {
                    toWalletEntity().open(
                      context,
                      id: 'To',
                      fallbackTitle: 'To',
                    );
                  }
                },
              );
              EntitySelect<Wallet> accountEntity() => EntitySelect<Wallet>(
                gridColumns: 3,
                value: _firstOrNull(
                  vm.walletOptions,
                  (w) => w.id == vm.state.walletId,
                ),
                items: vm.walletOptions,
                labelOf: (w) => w.name,
                idOf: (w) => w.id,
                onSelected: (w) => vm.setWallet(w.id),
              );
              EntitySelect<Category> categoryEntity() => EntitySelect<Category>(
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
                  // Only step-through chain on the initial fill — re-picking
                  // Category on an already-filled form shouldn't reopen Account.
                  if (vm.state.walletId == null) {
                    accountEntity().open(
                      context,
                      id: 'Account',
                      fallbackTitle: 'Account',
                    );
                  }
                },
              );

              void openAfterAmount() {
                if (vm.loadingPickers) {
                  _pendingAdvanceFromAmount = true;
                  return;
                }
                // Only step-through chain on the initial fill — resubmitting
                // Amount on an already-filled form shouldn't reopen the next
                // field if it's already picked.
                if (vm.state.type == TransactionType.transfer) {
                  if (vm.state.walletId == null) {
                    fromWalletEntity().open(
                      context,
                      id: 'From',
                      fallbackTitle: 'From',
                    );
                  }
                } else {
                  if (vm.state.categoryId == null) {
                    categoryEntity().open(
                      context,
                      id: 'Category',
                      fallbackTitle: 'Category',
                    );
                  }
                }
              }

              // Wallets/categories finished loading after openAfterAmount()
              // deferred — open now, with this build's freshly-loaded entities.
              if (_pendingAdvanceFromAmount && !vm.loadingPickers) {
                _pendingAdvanceFromAmount = false;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  openAfterAmount();
                });
              }

              // Auto open first input based on inputOrder setting — only for
              // a genuinely new transaction. Editing one starts already
              // "filled", so the chain shouldn't fire at all. `_autoOpenedAmount`
              // still flips on the very first build regardless, so clearing
              // Amount back to 0 later while editing doesn't retrigger this.
              if (!_autoOpenedAmount) {
                _autoOpenedAmount = true;
                if (vm.state.amount == 0) {
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
              }

              return ListView(
                padding: EdgeInsets.zero,
                children: [
                  SegmentedPillTabs(
                    selected: vm.state.type,
                    onChanged: vm.setType,
                  ),
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
                      // Only step-through chain on the initial fill —
                      // re-picking Date on an already-filled form shouldn't
                      // reopen Amount.
                      if (vm.state.amount == 0) {
                        openAmountDrawer(
                          context,
                          id: 'Amount',
                          initial: vm.state.amount,
                          workspaceTabs: true,
                          onChanged: vm.setAmount,
                          onSubmitted: (_) => openAfterAmount(),
                        );
                      }
                    },
                    labelPosition: InputLabelPosition.left,
                    variant: InputVariant.underline,
                  ),

                  _AmountRow(vm: vm, onSubmitted: (_) => openAfterAmount()),

                  if (vm.state.type == TransactionType.transfer) ...[
                    _TransferWalletsRow(
                      vm: vm,
                      fromEntity: fromWalletEntity(),
                      toEntity: toWalletEntity(),
                    ),
                  ] else ...[
                    Input(
                      context: InputContext.select,
                      label: 'Category',
                      placeholder: 'Choose a category',
                      labelPosition: InputLabelPosition.left,
                      variant: InputVariant.underline,
                      entity: categoryEntity(),
                    ),
                    Input(
                      context: InputContext.select,
                      label: 'Account',
                      placeholder: 'Choose an account',
                      entity: accountEntity(),
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
                              return Input(
                                variant: InputVariant.underline,
                                controller: textController,
                                focusNode: focusNode,
                                onChanged: vm.setNote,
                                onSubmitted: (_) => onFieldSubmitted(),
                                onTap: () =>
                                    FormDrawerScope.maybeOf(context)?.close(),
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
                            onTap: () =>
                                FormDrawerScope.maybeOf(context)?.close(),
                          ),
                  ),
                  const SizedBox(height: 24),
                  Container(height: 8, color: palette.muted),
                  const SectionLabel('Note'),
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
              );
            },
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

/// One picked or already-uploaded receipt image. `localPath` is set for a
/// freshly-picked image (gives an instant local preview while it uploads);
/// `id`/`existingUrl` are set once it has a vault id (either immediately
/// after upload, or seeded from `vm.state.attachmentIds` in edit mode, where
/// `existingUrl` is fetched lazily via a signed download URL).
class _AttachmentTile {
  _AttachmentTile.local(this.localPath) : id = null, existingUrl = null;
  _AttachmentTile.existing(this.id) : localPath = null, existingUrl = null;

  final String? localPath;
  String? id;
  String? existingUrl;
  bool uploading = false;
  AppError? error;

  ImageProvider? get preview {
    if (localPath != null) return FileImage(File(localPath!));
    if (existingUrl != null) return NetworkImage(existingUrl!);
    return null;
  }
}

/// Multi-line description (variant-styled [Input]) plus receipt image
/// attachments, shown as a 2-column grid. Each picked image uploads to the
/// vault immediately; its returned id rides along on the transaction draft
/// as `attachmentIds` when the form is saved. Tapping a tile opens a
/// full-screen preview; the × removes it (doesn't delete it from the vault).
class _DescriptionRow extends ConsumerStatefulWidget {
  const _DescriptionRow({required this.vm});
  final TransactionFormViewModel vm;

  @override
  ConsumerState<_DescriptionRow> createState() => _DescriptionRowState();
}

class _DescriptionRowState extends ConsumerState<_DescriptionRow> {
  late final List<_AttachmentTile> _tiles = [
    for (final id in widget.vm.state.attachmentIds) _AttachmentTile.existing(id),
  ];

  @override
  void initState() {
    super.initState();
    for (final tile in _tiles) {
      unawaited(_loadExistingUrl(tile));
    }
  }

  Future<void> _loadExistingUrl(_AttachmentTile tile) async {
    final res = await ref.read(vaultRepositoryProvider).getDownloadUrl(tile.id!);
    if (!mounted) return;
    res.fold((url) => setState(() => tile.existingUrl = url), (_) {});
  }

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
    if (source == null || !mounted) return;
    if (source == ImageSource.gallery) {
      final picked = await ImagePicker().pickMultiImage(
        maxWidth: 1600,
        imageQuality: 85,
      );
      for (final file in picked) {
        _addAndUpload(file);
      }
    } else {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 1600,
        imageQuality: 85,
      );
      if (picked != null) _addAndUpload(picked);
    }
  }

  void _addAndUpload(XFile file) {
    final tile = _AttachmentTile.local(file.path)..uploading = true;
    setState(() => _tiles.add(tile));
    unawaited(_upload(tile, file));
  }

  Future<void> _upload(_AttachmentTile tile, XFile file) async {
    final res = await widget.vm.uploadAttachment(File(file.path));
    if (!mounted) return;
    res.fold(
      (vaultFile) {
        tile
          ..id = vaultFile.id
          ..uploading = false;
        widget.vm.addAttachment(vaultFile.id);
        setState(() {});
      },
      (err) {
        tile
          ..uploading = false
          ..error = err;
        setState(() {});
      },
    );
  }

  void _removeTile(_AttachmentTile tile) {
    setState(() => _tiles.remove(tile));
    if (tile.id != null) widget.vm.removeAttachment(tile.id!);
  }

  void _previewTile(_AttachmentTile tile) {
    final image = tile.preview;
    if (image == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _AttachmentPreviewPage(image: image),
      ),
    );
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
          if (_tiles.isNotEmpty) ...[
            const SizedBox(height: 8),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _tiles.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 1.3,
              ),
              itemBuilder: (context, i) {
                final tile = _tiles[i];
                final preview = tile.preview;
                return GestureDetector(
                  onTap: () => _previewTile(tile),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: palette.muted,
                          border: tile.error != null
                              ? Border.all(color: OewangColors.coral)
                              : null,
                        ),
                        child: preview != null
                            ? Image(image: preview, fit: BoxFit.cover)
                            : null,
                      ),
                      if (tile.uploading)
                        Positioned.fill(
                          child: ColoredBox(
                            color: Colors.black.withValues(alpha: 0.4),
                            child: const Center(
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (tile.error != null)
                        const Positioned(
                          left: 4,
                          bottom: 4,
                          child: Icon(
                            Icons.error_outline,
                            size: 18,
                            color: OewangColors.coral,
                          ),
                        ),
                      Positioned(
                        top: -6,
                        right: -6,
                        child: IconButton(
                          tooltip: 'Remove receipt',
                          onPressed: () => _removeTile(tile),
                          icon: Icon(Icons.cancel, color: palette.foreground),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// Full-screen pinch-to-zoom preview for a tapped receipt tile.
class _AttachmentPreviewPage extends StatelessWidget {
  const _AttachmentPreviewPage({required this.image});
  final ImageProvider image;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Center(
            child: InteractiveViewer(child: Image(image: image)),
          ),
          Positioned(
            top: 0,
            right: 0,
            child: SafeArea(
              child: IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ),
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
