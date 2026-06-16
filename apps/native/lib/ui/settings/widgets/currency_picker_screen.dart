import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';

/// IMG_2259 — full-screen picker. Pops the chosen [CurrencyInfo] via
/// `Navigator.pop(...)`.
class CurrencyPickerScreen extends StatefulWidget {
  const CurrencyPickerScreen({super.key});

  @override
  State<CurrencyPickerScreen> createState() => _CurrencyPickerScreenState();
}

class _CurrencyPickerScreenState extends State<CurrencyPickerScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = CurrencyCatalog.search(_query);
    final grouped = CurrencyCatalog.groupByLetter(filtered);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chevron_left),
              Text('Back'),
            ],
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        leadingWidth: 100,
        title: Text(
          'Currency Setting',
          style: OewangFonts.sans(fontSize: 17),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  prefixIcon: const Icon(
                    Icons.search,
                    color: OewangColors.mutedForeground,
                  ),
                  hintText: 'Search',
                  filled: true,
                  fillColor: OewangColors.muted,
                  border: OutlineInputBorder(
                    borderSide: BorderSide.none,
                    borderRadius: BorderRadius.circular(OewangRadius.md),
                  ),
                  contentPadding: EdgeInsets.zero,
                ),
                style: OewangFonts.sans(),
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final entry in grouped.entries) ...[
                    Container(
                      width: double.infinity,
                      color: OewangColors.muted,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 6,
                      ),
                      child: Text(
                        entry.key,
                        style: OewangFonts.sans(
                          color: OewangColors.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    for (final c in entry.value)
                      InkWell(
                        onTap: () => Navigator.of(context).pop(c),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  c.displayLabel,
                                  style: OewangFonts.sans(),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
