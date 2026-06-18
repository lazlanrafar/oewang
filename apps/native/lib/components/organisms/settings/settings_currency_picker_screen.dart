import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/ui/core/page_app_bar.dart';

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
    final palette = context.palette;
    final filtered = CurrencyCatalog.search(_query);
    final grouped = CurrencyCatalog.groupByLetter(filtered);

    return Scaffold(
      appBar: const PageAppBar(
        title: 'Currency Setting',
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  prefixIcon: Icon(
                    Icons.search,
                    color: palette.mutedForeground,
                  ),
                  hintText: 'Search',
                  filled: true,
                  fillColor: palette.muted,
                  border: const OutlineInputBorder(
                    borderSide: BorderSide.none,
                    borderRadius: BorderRadius.zero,
                  ),
                  contentPadding: EdgeInsets.zero,
                ),
                style: OewangFonts.sans(color: palette.foreground),
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final entry in grouped.entries) ...[
                    Container(
                      width: double.infinity,
                      color: palette.muted,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 6,
                      ),
                      child: Text(
                        entry.key,
                        style: OewangFonts.sans(
                          color: palette.mutedForeground,
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
                                  style: OewangFonts.sans(
                                    color: palette.foreground,
                                  ),
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
