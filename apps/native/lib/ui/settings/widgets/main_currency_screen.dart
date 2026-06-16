import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/ui/settings/widgets/currency_picker_screen.dart';

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
          'Main Currency Setting',
          style: OewangFonts.sans(fontSize: 17),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: OutlinedButton(
              onPressed: _openPicker,
              style: OutlinedButton.styleFrom(
                foregroundColor: OewangColors.foreground,
                side: const BorderSide(color: OewangColors.border),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(OewangRadius.md),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                minimumSize: Size.zero,
              ),
              child: Text(
                'Change',
                style: OewangFonts.sans(fontSize: 13),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  Text(
                    '${_currency.code} - ${_currency.country} (${_currency.symbol})',
                    style: OewangFonts.sans(
                      color: OewangColors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_currency.symbol} ${_preview()}',
                    style: OewangFonts.currency(fontSize: 24),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: OewangColors.border),
            _Row(
              label: 'Unit\nposition',
              child: DropdownButton<String>(
                value: _unitPosition,
                underline: const SizedBox.shrink(),
                dropdownColor: OewangColors.card,
                items: const [
                  DropdownMenuItem(value: 'Front', child: Text('Front')),
                  DropdownMenuItem(value: 'Back', child: Text('Back')),
                ],
                onChanged: (v) =>
                    setState(() => _unitPosition = v ?? _unitPosition),
              ),
            ),
            const Divider(height: 1, color: OewangColors.border),
            _Row(
              label: 'Decimal\npoint',
              child: DropdownButton<int>(
                value: _decimalPoint,
                underline: const SizedBox.shrink(),
                dropdownColor: OewangColors.card,
                items: const [
                  DropdownMenuItem(value: 0, child: Text('0')),
                  DropdownMenuItem(value: 2, child: Text('1.00')),
                  DropdownMenuItem(value: 4, child: Text('1.0000')),
                ],
                onChanged: (v) =>
                    setState(() => _decimalPoint = v ?? _decimalPoint),
              ),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: OewangColors.coral,
                    foregroundColor: OewangColors.foreground,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(OewangRadius.lg),
                    ),
                  ),
                  onPressed: () {
                    Navigator.of(context).pop(true);
                  },
                  child: Text(
                    'Save',
                    style: OewangFonts.sans(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _preview() {
    if (_decimalPoint == 0) return '1';
    return 1.toStringAsFixed(_decimalPoint);
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.child});
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
            width: 80,
            child: Text(
              label,
              style: OewangFonts.sans(color: OewangColors.mutedForeground),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}
