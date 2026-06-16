import 'package:flutter/material.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/core/theme/oewang_palette.dart';
import 'package:oewang/core/theme/oewang_radius.dart';
import 'package:oewang/core/theme/oewang_typography.dart';

/// IMG_1833 — number-pad keypad with + − × ÷ for entering an amount.
/// Returns the evaluated value via `Navigator.pop(num)`.
class AmountCalculatorSheet extends StatefulWidget {
  const AmountCalculatorSheet({this.initial = 0, super.key});

  final num initial;

  static Future<num?> show(BuildContext context, {num initial = 0}) {
    return showModalBottomSheet<num>(
      context: context,
      backgroundColor: context.palette.background,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => AmountCalculatorSheet(initial: initial),
    );
  }

  @override
  State<AmountCalculatorSheet> createState() => _AmountCalculatorSheetState();
}

enum _CellKind { digit, op, ok }

class _Cell {
  const _Cell({
    required this.kind,
    required this.label,
    required this.onTap,
  });

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

class _AmountCalculatorSheetState extends State<AmountCalculatorSheet> {
  late String _display = widget.initial == 0
      ? '0'
      : widget.initial.toString();
  String _pending = '';
  String? _op;

  void _onDigit(String d) {
    setState(() {
      if (_display == '0') {
        _display = d;
      } else {
        _display += d;
      }
    });
  }

  void _onClear() {
    setState(() {
      _display = '0';
      _pending = '';
      _op = null;
    });
  }

  void _onBackspace() {
    setState(() {
      if (_display.length <= 1) {
        _display = '0';
      } else {
        _display = _display.substring(0, _display.length - 1);
      }
    });
  }

  void _onOp(String op) {
    setState(() {
      _pending = _display;
      _op = op;
      _display = '0';
    });
  }

  num _evaluate() {
    if (_op == null || _pending.isEmpty) {
      return num.tryParse(_display) ?? 0;
    }
    final a = num.tryParse(_pending) ?? 0;
    final b = num.tryParse(_display) ?? 0;
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
  }

  void _onOk() {
    Navigator.of(context).pop(_evaluate());
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            color: palette.muted,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Text(
                  'Amount',
                  style: OewangFonts.sans(
                    color: palette.foreground,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(Icons.close, color: palette.foreground),
                ),
              ],
            ),
          ),
          Container(
            color: palette.background,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
            alignment: Alignment.centerRight,
            child: Text(
              _display,
              style: OewangFonts.currency(
                color: palette.foreground,
                fontSize: 30,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          _CellRow(
            cells: [
              _Cell.op('+', () => _onOp('+')),
              _Cell.op('-', () => _onOp('-')),
              _Cell.op('×', () => _onOp('×')),
              _Cell.op('÷', () => _onOp('÷')),
            ],
          ),
          _CellRow(
            cells: [
              _Cell.digit('7', () => _onDigit('7')),
              _Cell.digit('8', () => _onDigit('8')),
              _Cell.digit('9', () => _onDigit('9')),
              _Cell.op('=', _onEquals),
            ],
          ),
          _CellRow(
            cells: [
              _Cell.digit('4', () => _onDigit('4')),
              _Cell.digit('5', () => _onDigit('5')),
              _Cell.digit('6', () => _onDigit('6')),
              _Cell.op(',', () => _onDigit('.')),
            ],
          ),
          _CellRow(
            cells: [
              _Cell.digit('1', () => _onDigit('1')),
              _Cell.digit('2', () => _onDigit('2')),
              _Cell.digit('3', () => _onDigit('3')),
              _Cell.op('⌫', _onBackspace),
            ],
          ),
          _CellRow(
            cells: [
              _Cell.digit('00', () => _onDigit('00')),
              _Cell.digit('0', () => _onDigit('0')),
              _Cell.digit('000', () => _onDigit('000')),
              _Cell.ok(_onOk),
            ],
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _onClear,
            child: Text(
              'Clear',
              style: OewangFonts.sans(color: palette.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}

class _CellRow extends StatelessWidget {
  const _CellRow({required this.cells});
  final List<_Cell> cells;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    Color bg(_CellKind k) => switch (k) {
      _CellKind.digit => palette.card,
      _CellKind.op => palette.muted,
      _CellKind.ok => OewangColors.coral,
    };
    Color fg(_CellKind k) =>
        k == _CellKind.ok ? Colors.white : palette.foreground;
    return SizedBox(
      height: 52,
      child: Row(
        children: [
          for (final cell in cells)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Material(
                  color: bg(cell.kind),
                  borderRadius: BorderRadius.circular(OewangRadius.sm),
                  child: InkWell(
                    onTap: cell.onTap,
                    borderRadius: BorderRadius.circular(OewangRadius.sm),
                    child: Center(
                      child: Text(
                        cell.label,
                        style: OewangFonts.sans(
                          color: fg(cell.kind),
                          fontSize: 18,
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
