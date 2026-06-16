import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';

/// IMG_2260 — Sub Currency Setting. FX values are placeholders; the real
/// endpoint lands when the settings API gets wired.
class SubCurrencyScreen extends StatelessWidget {
  const SubCurrencyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final entries = <_SubEntry>[
      _SubEntry(
        currency: CurrencyCatalog.all.firstWhere((c) => c.code == 'SGD'),
        rateInIdr: 13319.6486421,
      ),
      _SubEntry(
        currency: CurrencyCatalog.all.firstWhere((c) => c.code == 'USD'),
        rateInIdr: 16834.504124,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Settings'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 130,
        title: Text(
          'Sub Currency Setting',
          style: OewangFonts.sans(fontSize: 17),
        ),
        actions: [
          IconButton(
            onPressed: () => _comingSoon(context),
            icon: Icon(Icons.edit_outlined, color: palette.foreground),
          ),
          IconButton(
            onPressed: () => _comingSoon(context),
            icon: Icon(Icons.add, color: palette.foreground),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          children: [
            for (final e in entries) _SubRow(entry: e),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'sub-currency-refresh',
        backgroundColor: palette.muted,
        foregroundColor: palette.foreground,
        elevation: 0,
        shape: const CircleBorder(),
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Refreshing FX rates…')),
        ),
        child: const Icon(Icons.refresh),
      ),
    );
  }

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sub currency editing — coming soon')),
    );
  }
}

class _SubEntry {
  const _SubEntry({required this.currency, required this.rateInIdr});
  final CurrencyInfo currency;
  final double rateInIdr;
}

class _SubRow extends StatelessWidget {
  const _SubRow({required this.entry});
  final _SubEntry entry;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final formatter = NumberFormat('#,##0.#######', 'id_ID');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${entry.currency.code} 1.00 = IDR ${formatter.format(entry.rateInIdr)}',
            style: OewangFonts.sans(color: palette.foreground),
          ),
          const SizedBox(height: 2),
          Text(
            entry.currency.displayLabel,
            style: OewangFonts.sans(
              color: palette.mutedForeground,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
