import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/settings/currency/settings_currency_picker_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/domain/models/workspace.dart';

/// IMG_1849 / IMG_2258 — Main Currency Setting: the workspace currency
/// (`/v1/workspaces/current/currency/*`, WAL-5 to WAL-7). Only the owner
/// sees Change. Before the first transaction it is a plain setting; after,
/// it is locked and changing it converts the whole ledger at one rate.
///
/// The old screen's unit position and decimal point rows are gone: they were
/// only ever held on the screen, and the API formats every figure itself.
class MainCurrencyScreen extends ConsumerStatefulWidget {
  const MainCurrencyScreen({super.key});

  @override
  ConsumerState<MainCurrencyScreen> createState() => _MainCurrencyScreenState();
}

class _MainCurrencyScreenState extends ConsumerState<MainCurrencyScreen> {
  bool _saving = false;

  Future<void> _change(Workspace workspace) async {
    final picked = await Navigator.of(context).push<CurrencyInfo>(
      MaterialPageRoute(builder: (_) => const CurrencyPickerScreen()),
    );
    if (picked == null || !mounted) return;
    if (picked.code == workspace.currencyCode) return;
    final repo = ref.read(workspacesRepositoryProvider);

    if (!workspace.currencyLocked) {
      await _run(() => repo.setCurrency(picked.code));
      return;
    }
    setState(() => _saving = true);
    final preview = await repo.previewConversion(picked.code);
    if (!mounted) return;
    setState(() => _saving = false);
    switch (preview) {
      case Failure(:final error):
        _snack(error.message);
      case Success(:final value):
        final rate = await showDialog<Decimal>(
          context: context,
          builder: (_) => _ConvertDialog(preview: value),
        );
        if (rate == null || !mounted) return;
        await _run(
          () => repo.convertCurrency(currencyCode: picked.code, rate: rate),
        );
    }
  }

  Future<void> _run(Future<Result<void, AppError>> Function() write) async {
    setState(() => _saving = true);
    final res = await write();
    if (!mounted) return;
    setState(() => _saving = false);
    switch (res) {
      case Failure(:final error):
        _snack(error.message);
      case Success():
        // Every figure is in the new currency now.
        ref
          ..invalidate(currentWorkspaceProvider)
          ..read(transactionsRevisionProvider.notifier).bump()
          ..read(walletsRevisionProvider.notifier).bump()
          ..read(budgetsRevisionProvider.notifier).bump();
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final async = ref.watch(currentWorkspaceProvider);
    final isOwner = ref.watch(isOwnerProvider);
    final workspace = async.valueOrNull;
    final currency = workspace == null
        ? null
        : CurrencyCatalog.all
              .where((c) => c.code == workspace.currencyCode)
              .firstOrNull;

    return Scaffold(
      appBar: PageAppBar(
        title: 'Main Currency Setting',
        backLabel: 'Settings',
        actions: [
          if (isOwner && workspace != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Button(
                label: 'Change',
                variant: ButtonVariant.outlined,
                fullWidth: false,
                height: 32,
                loading: _saving,
                onPressed: _saving ? null : () => _change(workspace),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: async.isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      children: [
                        Text(
                          currency == null
                              ? workspace?.currencyCode ?? ''
                              : '${currency.code} - ${currency.country} '
                                    '(${currency.symbol})',
                          style: OewangFonts.sans(
                            color: palette.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${currency?.symbol ?? ''} 1.00',
                          style: OewangFonts.currency(
                            color: palette.foreground,
                            fontSize: 24,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: palette.border),
                  if (workspace?.currencyLocked ?? false)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Transactions exist, so changing the currency '
                        'converts every amount at one rate.',
                        textAlign: TextAlign.center,
                        style: OewangFonts.sans(
                          color: palette.mutedForeground,
                          fontSize: 13,
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

/// Asks for the conversion rate, prefilled from the newest snapshot, and
/// says what it will touch. Pops the rate, or null.
class _ConvertDialog extends StatefulWidget {
  const _ConvertDialog({required this.preview});
  final CurrencyPreview preview;

  @override
  State<_ConvertDialog> createState() => _ConvertDialogState();
}

class _ConvertDialogState extends State<_ConvertDialog> {
  late final _ctl = TextEditingController(
    text: widget.preview.suggestedRate?.toString() ?? '',
  );

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  /// A comma is how the app writes a decimal; the API reads a point.
  Decimal? get _rate {
    final rate = Decimal.tryParse(_ctl.text.trim().replaceAll(',', '.'));
    return rate == null || rate <= Decimal.zero ? null : rate;
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final p = widget.preview;
    return AlertDialog(
      backgroundColor: palette.card,
      title: Text(
        'Convert to ${p.to}',
        style: OewangFonts.sans(color: palette.foreground),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${p.transactions} transactions and ${p.budgets} budgets will be '
            'repriced. This cannot be undone.',
            style: OewangFonts.sans(color: palette.mutedForeground),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _ctl,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: '${p.to} per 1 ${p.from}'),
            style: OewangFonts.sans(color: palette.foreground),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: _rate == null
              ? null
              : () => Navigator.of(context).pop(_rate),
          child: const Text('Convert'),
        ),
      ],
    );
  }
}
