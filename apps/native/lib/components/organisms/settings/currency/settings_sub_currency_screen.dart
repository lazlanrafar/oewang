import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/settings/currency/settings_currency_picker_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/domain/models/sub_currency.dart';

/// Bumped after add/delete so the list provider re-fetches.
class _SubCurrenciesRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final _subCurrenciesRevisionProvider =
    NotifierProvider<_SubCurrenciesRevision, int>(_SubCurrenciesRevision.new);

final _subCurrenciesProvider = FutureProvider.autoDispose<List<SubCurrency>>((
  ref,
) async {
  ref.watch(_subCurrenciesRevisionProvider);
  final res = await ref.watch(subCurrenciesRepositoryProvider).list();
  return res.fold((ok) => ok, (_) => const <SubCurrency>[]);
});

/// Rates against IDR — `1 IDR = N units of code`. The screen inverts.
final _ratesProvider = FutureProvider.autoDispose<Map<String, double>>((
  ref,
) async {
  ref.watch(_subCurrenciesRevisionProvider);
  final res = await ref.watch(ratesRepositoryProvider).rates(base: 'IDR');
  return res.fold((ok) => ok, (_) => const <String, double>{});
});

/// IMG_2260 — Sub Currency Setting backed by the workspace API.
class SubCurrencyScreen extends ConsumerWidget {
  const SubCurrencyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    final subs = ref.watch(_subCurrenciesProvider);
    final rates = ref.watch(_ratesProvider);

    return Scaffold(
      appBar: PageAppBar(
        title: 'Sub Currency Setting',
        backLabel: 'Settings',
        actions: [
          IconButton(
            onPressed: () => _showInstructions(context),
            icon: Icon(Icons.edit_outlined, color: palette.foreground),
          ),
          IconButton(
            onPressed: () => _onAdd(context, ref),
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: subs.when(
          data: (items) => items.isEmpty
              ? Center(
                  child: Text(
                    'No sub-currencies. Tap + to add one.',
                    style: OewangFonts.sans(color: palette.mutedForeground),
                  ),
                )
              : ListView(
                  children: [
                    for (final s in items)
                      _SubRow(
                        sub: s,
                        rateInIdr: _rateAgainstIdr(s.currencyCode, rates),
                        onDelete: () => _onDelete(context, ref, s),
                      ),
                  ],
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text(
              e.toString(),
              style: OewangFonts.sans(color: OewangColors.coral),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'sub-currency-refresh',
        backgroundColor: palette.muted,
        foregroundColor: palette.foreground,
        elevation: 0,
        shape: const CircleBorder(),
        onPressed: () =>
            ref.read(_subCurrenciesRevisionProvider.notifier).bump(),
        child: const Icon(Icons.refresh),
      ),
    );
  }

  /// Rates are returned as "1 IDR = N units of code", so flip to display
  /// "1 unit of code = M IDR".
  double? _rateAgainstIdr(String code, AsyncValue<Map<String, double>> rates) {
    final map = rates.valueOrNull;
    if (map == null) return null;
    final r = map[code];
    if (r == null || r == 0) return null;
    return 1 / r;
  }

  Future<void> _onAdd(BuildContext context, WidgetRef ref) async {
    final picked = await Navigator.of(context).push<CurrencyInfo>(
      MaterialPageRoute(builder: (_) => const CurrencyPickerScreen()),
    );
    if (picked == null || !context.mounted) return;
    final res = await ref
        .read(subCurrenciesRepositoryProvider)
        .create(picked.code);
    if (!context.mounted) return;
    res.fold(
      (_) => ref.read(_subCurrenciesRevisionProvider.notifier).bump(),
      (e) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      ),
    );
  }

  Future<void> _onDelete(
    BuildContext context,
    WidgetRef ref,
    SubCurrency sub,
  ) async {
    final res = await ref
        .read(subCurrenciesRepositoryProvider)
        .delete(sub.id);
    if (!context.mounted) return;
    res.fold(
      (_) => ref.read(_subCurrenciesRevisionProvider.notifier).bump(),
      (e) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      ),
    );
  }

  void _showInstructions(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Swipe a row to delete a sub-currency.'),
      ),
    );
  }
}

class _SubRow extends StatelessWidget {
  const _SubRow({
    required this.sub,
    required this.rateInIdr,
    required this.onDelete,
  });

  final SubCurrency sub;
  final double? rateInIdr;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    CurrencyInfo? info;
    for (final c in CurrencyCatalog.all) {
      if (c.code == sub.currencyCode) {
        info = c;
        break;
      }
    }

    final formatter = NumberFormat('#,##0.#######', 'id_ID');
    final headline = rateInIdr == null
        ? '${sub.currencyCode} 1.00 = IDR …'
        : '${sub.currencyCode} 1.00 = IDR ${formatter.format(rateInIdr)}';

    return Dismissible(
      key: ValueKey(sub.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDelete(),
      background: Container(
        color: OewangColors.coral,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              headline,
              style: OewangFonts.sans(color: palette.foreground),
            ),
            const SizedBox(height: 2),
            Text(
              info?.displayLabel ?? sub.currencyCode,
              style: OewangFonts.sans(
                color: palette.mutedForeground,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
