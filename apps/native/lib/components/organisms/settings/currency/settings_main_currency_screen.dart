import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/button.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/components/molecules/page_app_bar.dart';
import 'package:oewang/components/organisms/settings/currency/settings_currency_picker_screen.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';

/// IMG_1849 / IMG_2258 — Main Currency Setting. Persisting it lives behind
/// the settings API; for now the state is local to the screen.
class MainCurrencyScreen extends StatefulWidget {
  const MainCurrencyScreen({super.key});

  @override
  State<MainCurrencyScreen> createState() => _MainCurrencyScreenState();
}

class _MainCurrencyScreenState extends State<MainCurrencyScreen> {
  static final _idr = CurrencyCatalog.all.firstWhere((c) => c.code == 'IDR');
  CurrencyInfo _currency = _idr;
  String _unitPosition = 'Front';
  int _decimalPoint = 2;

  Future<void> _openPicker() async {
    final picked = await Navigator.of(context).push<CurrencyInfo>(
      MaterialPageRoute(builder: (_) => const CurrencyPickerScreen()),
    );
    if (picked != null && mounted) setState(() => _currency = picked);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      appBar: PageAppBar(
        title: 'Main Currency Setting',
        backLabel: 'Settings',
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Button(
              label: 'Change',
              variant: ButtonVariant.outlined,
              fullWidth: false,
              height: 32,
              onPressed: _openPicker,
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: FormDrawerHost(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Column(
                  children: [
                    Text(
                      '${_currency.code} - ${_currency.country} (${_currency.symbol})',
                      style: OewangFonts.sans(color: palette.mutedForeground),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_currency.symbol} ${_preview()}',
                      style: OewangFonts.currency(
                        color: palette.foreground,
                        fontSize: 24,
                      ),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: palette.border),
              Input(
                context: InputContext.select,
                label: 'Unit\nposition',
                labelWidth: 80,
                variant: InputVariant.none,
                entity: EntitySelect<String>(
                  value: _unitPosition,
                  items: const ['Front', 'Back'],
                  labelOf: (s) => s,
                  idOf: (s) => s,
                  onSelected: (s) => setState(() => _unitPosition = s),
                ),
              ),
              Divider(height: 1, color: palette.border),
              Input(
                context: InputContext.select,
                label: 'Decimal\npoint',
                labelWidth: 80,
                variant: InputVariant.none,
                entity: EntitySelect<int>(
                  value: _decimalPoint,
                  items: const [0, 2, 4],
                  labelOf: (d) => switch (d) {
                    0 => '0',
                    2 => '1.00',
                    _ => '1.0000',
                  },
                  idOf: (d) => '$d',
                  onSelected: (d) => setState(() => _decimalPoint = d),
                ),
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Button(
                  label: 'Save',
                  onPressed: () => Navigator.of(context).pop(true),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _preview() {
    if (_decimalPoint == 0) return '1';
    return 1.toStringAsFixed(_decimalPoint);
  }
}
