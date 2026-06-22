import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_header.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_host.dart';
import 'package:oewang/components/atoms/inputs/bases/input_base_drawer_metrics.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_row.dart';
import 'package:oewang/components/atoms/inputs/input.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/format/amount_format.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// Workspace currencies for the keypad tabs: the main currency (IDR) first,
/// then the workspace sub-currencies. Read from the global
/// [subCurrenciesProvider] so callers never pass a currency list.
List<String> workspaceCurrencyCodes(WidgetRef ref) {
  final subs = ref.watch(subCurrenciesProvider).valueOrNull ?? const [];
  return [
    'IDR',
    for (final s in subs)
      if (s.currencyCode != 'IDR') s.currencyCode,
  ];
}

/// `InputContext.currency` / `InputContext.amount` — a labelled row that opens
/// the keypad drawer and shows the live-grouped amount (always with the ISO
/// code, e.g. "IDR 1.000"). [workspaceTabs] enables the workspace currency
/// switcher in the keypad.
Widget buildCurrencyContext(
  BuildContext context,
  Input widget, {
  required String currency,
  required ValueChanged<String> onCurrencyChange,
  required bool workspaceTabs,
}) {
  final palette = context.palette;
  final label = widget.label ?? 'Amount';
  void open() => openAmountDrawer(
    context,
    id: widget.drawerId ?? label,
    initial: widget.amount,
    title: label,
    currency: currency,
    workspaceTabs: workspaceTabs,
    onChanged: widget.onAmountChanged!,
    onCurrencyChanged: onCurrencyChange,
  );

  return inputFieldLayout(
    context,
    widget,
    label: label,
    onTap: open,
    value: Text(
      AmountFormat.currency(widget.amount, currency: currency, useCode: true),
      style: OewangFonts.currency(
        color: widget.valueColor ?? palette.foreground,
        fontSize: 16,
      ),
    ),
  );
}

// ── Keypad drawer ───────────────────────────────────────────────────────────

/// Opens the amount keypad — in the shared panel when a [FormDrawerHost] is an
/// ancestor, otherwise as a modal bottom sheet.
void openAmountDrawer(
  BuildContext context, {
  required String id,
  required num initial,
  required ValueChanged<num> onChanged,
  String title = 'Amount',
  String currency = 'IDR',
  ValueChanged<String>? onCurrencyChanged,
  bool workspaceTabs = false,
}) {
  final controller = FormDrawerScope.maybeOf(context);
  if (controller != null) {
    controller.open(
      id,
      (_) => AmountKeypad(
        initial: initial,
        title: title,
        currency: currency,
        workspaceTabs: workspaceTabs,
        onChanged: onChanged,
        onCurrencyChanged: onCurrencyChanged,
        onSubmit: (_) => controller.close(),
        onClose: controller.close,
      ),
    );
  } else {
    AmountKeypadSheet.show(
      context,
      initial: initial,
      onChanged: onChanged,
      title: title,
      currency: currency,
      workspaceTabs: workspaceTabs,
      onCurrencyChanged: onCurrencyChanged,
    );
  }
}


/// A full-bleed numeric keypad (no in-panel display) for entering an amount.
///
/// As the user types, [onChanged] fires live so the value renders in the form
/// field above. [onSubmit] is called with the evaluated value (OK) and
/// [onClose] when the close button is tapped. This widget never touches the
/// Navigator itself.
class AmountKeypad extends ConsumerStatefulWidget {
  const AmountKeypad({
    this.initial = 0,
    this.onChanged,
    this.onSubmit,
    this.onClose,
    this.onCurrencyChanged,
    this.currency = 'IDR',
    this.title = 'Amount',
    this.workspaceTabs = false,
    super.key,
  });

  final num initial;
  final ValueChanged<num>? onChanged;
  final ValueChanged<num>? onSubmit;
  final VoidCallback? onClose;
  final ValueChanged<String>? onCurrencyChanged;
  final String currency;
  final String title;

  /// When true the keypad shows a tab per workspace currency (read from the
  /// global [subCurrenciesProvider]); the tabs auto-hide when the workspace
  /// has only its main currency. When false the keypad is a plain amount entry.
  final bool workspaceTabs;

  @override
  ConsumerState<AmountKeypad> createState() => _AmountKeypadState();
}

enum _CellKind { digit, op, ok }

class _Cell {
  const _Cell({required this.kind, required this.label, required this.onTap});

  factory _Cell.digit(String label, VoidCallback onTap) =>
      _Cell(kind: _CellKind.digit, label: label, onTap: onTap);
  factory _Cell.op(String label, VoidCallback onTap) =>
      _Cell(kind: _CellKind.op, label: label, onTap: onTap);
  factory _Cell.ok(VoidCallback onTap) =>
      _Cell(kind: _CellKind.ok, label: 'OK', onTap: onTap);

  final _CellKind kind;
  final String label;
  final VoidCallback onTap;
}

class _AmountKeypadState extends ConsumerState<AmountKeypad> {
  late String _display = _initialDisplay();
  late String _currency = widget.currency;
  String _pending = '';
  String? _op;

  String _initialDisplay() {
    final v = widget.initial;
    if (v == 0) return '0';
    return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
  }

  num get _current {
    final raw = _display.endsWith('.')
        ? _display.substring(0, _display.length - 1)
        : _display;
    return num.tryParse(raw) ?? 0;
  }

  void _emit() => widget.onChanged?.call(_current);

  void _onDigit(String d) {
    setState(() {
      if (d == '.') {
        if (_display.contains('.')) return;
        _display = '$_display.';
      } else if (_display == '0') {
        _display = d;
      } else {
        _display += d;
      }
    });
    _emit();
  }

  void _onBackspace() {
    setState(() {
      _display = _display.length <= 1
          ? '0'
          : _display.substring(0, _display.length - 1);
    });
    _emit();
  }

  void _onOp(String op) {
    setState(() {
      _pending = _display;
      _op = op;
      _display = '0';
    });
    _emit();
  }

  num _evaluate() {
    if (_op == null || _pending.isEmpty) return _current;
    final a = num.tryParse(_pending) ?? 0;
    final b = _current;
    switch (_op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b == 0 ? 0 : a / b;
    }
    return b;
  }

  void _onEquals() {
    setState(() {
      _display = _evaluate().toString();
      _pending = '';
      _op = null;
    });
    _emit();
  }

  void _onOk() {
    final value = _evaluate();
    widget.onChanged?.call(value);
    widget.onSubmit?.call(value);
  }

  void _onCurrency(String code) {
    setState(() => _currency = code);
    widget.onCurrencyChanged?.call(code);
  }

  @override
  Widget build(BuildContext context) {
    // Workspace currencies drive the tabs; show them only when the workspace
    // tracks more than its main currency.
    final codes = widget.workspaceTabs
        ? workspaceCurrencyCodes(ref)
        : const <String>[];
    final showTabs = codes.length > 1;

    return Column(
      mainAxisSize: MainAxisSize.max,
      children: [
        FormDrawerHeader(
          title: widget.title,
          onClose: widget.onClose,
          actions: showTabs
              ? const [
                  Icon(Icons.language, color: DrawerMetrics.onHeader, size: 22),
                  SizedBox(width: 8),
                ]
              : const [],
        ),
        if (showTabs)
          _CurrencyTabs(
            codes: codes,
            selected: _currency,
            onSelected: _onCurrency,
          ),
        Expanded(
          child: Column(
            children: [
              _KeyRow(
                cells: [
                  _Cell.op('+', () => _onOp('+')),
                  _Cell.op('-', () => _onOp('-')),
                  _Cell.op('×', () => _onOp('×')),
                  _Cell.op('÷', () => _onOp('÷')),
                ],
              ),
              _KeyRow(
                cells: [
                  _Cell.digit('7', () => _onDigit('7')),
                  _Cell.digit('8', () => _onDigit('8')),
                  _Cell.digit('9', () => _onDigit('9')),
                  _Cell.op('=', _onEquals),
                ],
              ),
              _KeyRow(
                cells: [
                  _Cell.digit('4', () => _onDigit('4')),
                  _Cell.digit('5', () => _onDigit('5')),
                  _Cell.digit('6', () => _onDigit('6')),
                  _Cell.op(',', () => _onDigit('.')),
                ],
              ),
              _KeyRow(
                cells: [
                  _Cell.digit('1', () => _onDigit('1')),
                  _Cell.digit('2', () => _onDigit('2')),
                  _Cell.digit('3', () => _onDigit('3')),
                  _Cell.op('⌫', _onBackspace),
                ],
              ),
              _KeyRow(
                cells: [
                  _Cell.digit('00', () => _onDigit('00')),
                  _Cell.digit('0', () => _onDigit('0')),
                  _Cell.digit('000', () => _onDigit('000')),
                  _Cell.ok(_onOk),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CurrencyTabs extends StatelessWidget {
  const _CurrencyTabs({
    required this.codes,
    required this.selected,
    required this.onSelected,
  });

  final List<String> codes;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: DrawerMetrics.currencyBar,
      child: Row(
        children: [
          for (final code in codes)
            InkWell(
              onTap: () => onSelected(code),
              child: Container(
                color: code == selected
                    ? DrawerMetrics.currencyBarSelected
                    : null,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
                child: Text(
                  code,
                  style: OewangFonts.sans(
                    color: DrawerMetrics.onHeader,
                    fontSize: 15,
                    fontWeight: code == selected
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One row of keys that stretches to fill the available height; cells are
/// full-bleed with thin grid separators.
class _KeyRow extends StatelessWidget {
  const _KeyRow({required this.cells});
  final List<_Cell> cells;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    Color bg(_CellKind k) =>
        k == _CellKind.ok ? palette.primary : palette.background;
    Color fg(_CellKind k) =>
        k == _CellKind.ok ? palette.primaryForeground : palette.foreground;
    return Expanded(
      child: Row(
        children: [
          for (final cell in cells)
            Expanded(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: palette.border),
                    bottom: BorderSide(color: palette.border),
                  ),
                ),
                child: Material(
                  color: bg(cell.kind),
                  child: InkWell(
                    onTap: cell.onTap,
                    child: Center(
                      child: Text(
                        cell.label,
                        style: OewangFonts.sans(
                          color: fg(cell.kind),
                          fontSize: 20,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Modal fallback — opens [AmountKeypad] as a fixed-height bottom sheet and
/// returns the confirmed value (OK) or `null` if dismissed.
class AmountKeypadSheet {
  const AmountKeypadSheet._();

  static Future<num?> show(
    BuildContext context, {
    num initial = 0,
    ValueChanged<num>? onChanged,
    ValueChanged<String>? onCurrencyChanged,
    String currency = 'IDR',
    String title = 'Amount',
    bool workspaceTabs = false,
  }) {
    return showModalBottomSheet<num>(
      context: context,
      backgroundColor: DrawerMetrics.surface(context),
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: SizedBox(
          height: DrawerMetrics.height,
          child: AmountKeypad(
            initial: initial,
            title: title,
            currency: currency,
            workspaceTabs: workspaceTabs,
            onChanged: onChanged,
            onCurrencyChanged: onCurrencyChanged,
            onSubmit: (v) => Navigator.of(sheetContext).pop(v),
            onClose: () => Navigator.of(sheetContext).pop(),
          ),
        ),
      ),
    );
  }
}
