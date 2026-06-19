import 'package:flutter/material.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_currency.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_date.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_select.dart';
import 'package:oewang/components/atoms/inputs/contexts/input_context_text.dart';
import 'package:oewang/components/atoms/inputs/input_context.dart';
import 'package:oewang/components/atoms/inputs/input_label_position.dart';
import 'package:oewang/components/atoms/inputs/input_variant.dart';

export 'package:oewang/components/atoms/inputs/contexts/input_context_select.dart'
    show EntitySelect;
export 'package:oewang/components/atoms/inputs/input_context.dart';
export 'package:oewang/components/atoms/inputs/input_label_position.dart';
export 'package:oewang/components/atoms/inputs/input_variant.dart';

/// The one input component for the app. Pick a [context] for behaviour and a
/// [variant] for the look — there is no other input/field/select widget.
///
/// - `text` / `accounts` — typed [TextField]; `variant` chooses the border.
/// - `currency` — labelled row that opens the **keypad drawer** (`Rp 1.000.000`).
/// - `date` — labelled row that opens the **calendar drawer**.
/// - `select` — labelled row that opens an **entity picker drawer** (pass
///   [entity]), or a plain tappable row (pass [displayValue] + [onTap]).
///
/// Each context's render code (and its drawer/sheet) lives in `contexts/`; this
/// widget only holds the shared props + state and dispatches in [build].
///
/// ```dart
/// Input(controller: c, variant: InputVariant.outlined);                 // text
/// Input(context: InputContext.currency, amount: v, onAmountChanged: f); // keypad
/// Input(context: InputContext.date, date: d, onDateChanged: f);         // calendar
/// Input(context: InputContext.select, entity: EntitySelect<Category>(   // picker
///   value: cat, items: cats, labelOf: (c) => c.name, idOf: (c) => c.id,
///   onSelected: pick));
/// ```
class Input extends StatefulWidget {
  const Input({
    this.context = InputContext.text,
    this.variant = InputVariant.underline,
    this.label,
    // row layout (currency / date / select)
    this.labelPosition = InputLabelPosition.left,
    this.labelWidth = 84,
    this.height,
    this.showBorder = false,
    this.drawerId,
    this.valueColor,
    this.trailing,
    this.placeholder = '',
    // text / accounts
    this.controller,
    this.hintText,
    this.autofocus = false,
    this.obscureText = false,
    this.keyboardType,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    // currency
    this.amount = 0,
    this.onAmountChanged,
    this.currency = 'IDR',
    this.onCurrencyChanged,
    this.showCurrencyTabs = true,
    this.useCurrencyCode = false,
    // date
    this.date,
    this.onDateChanged,
    this.datePattern = 'EEE, dd/MM/yyyy',
    this.firstDate,
    this.lastDate,
    // select
    this.entity,
    this.displayValue,
    this.onTap,
    super.key,
  }) : assert(
         context != InputContext.currency || onAmountChanged != null,
         'currency Input needs onAmountChanged',
       ),
       assert(
         context != InputContext.date || (date != null && onDateChanged != null),
         'date Input needs date + onDateChanged',
       ),
       assert(
         context != InputContext.select || entity != null || onTap != null,
         'select Input needs an entity or onTap',
       );

  final InputContext context;
  final InputVariant variant;
  final String? label;

  // row layout

  /// `left` keeps the plain two-column row (variant ignored); `top` stacks the
  /// label above a bordered field that renders [variant]. Currency / date /
  /// select only.
  final InputLabelPosition labelPosition;
  final double labelWidth;
  final double? height;
  final bool showBorder;

  /// Unique drawer id within a form (currency / date / select). Defaults to
  /// [label].
  final String? drawerId;

  /// Tints the displayed value (currency / select).
  final Color? valueColor;

  /// Widget after the value (currency / select), e.g. a "Fees" button.
  final Widget? trailing;

  /// Muted text shown when a select has no value.
  final String placeholder;

  // text / accounts
  final TextEditingController? controller;
  final String? hintText;
  final bool autofocus;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  // currency
  final num amount;
  final ValueChanged<num>? onAmountChanged;
  final String currency;
  final ValueChanged<String>? onCurrencyChanged;
  final bool showCurrencyTabs;
  final bool useCurrencyCode;

  // date
  final DateTime? date;
  final ValueChanged<DateTime>? onDateChanged;
  final String datePattern;
  final DateTime? firstDate;
  final DateTime? lastDate;

  // select
  final EntitySelect<dynamic>? entity;
  final String? displayValue;
  final VoidCallback? onTap;

  @override
  State<Input> createState() => _InputState();
}

class _InputState extends State<Input> {
  TextEditingController? _internal;
  TextEditingController get _controller =>
      widget.controller ?? (_internal ??= TextEditingController());

  late bool _obscured = widget.obscureText;
  late String _currency = widget.currency;

  @override
  void didUpdateWidget(covariant Input oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currency != widget.currency) _currency = widget.currency;
  }

  @override
  void dispose() {
    _internal?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Each context's render code lives in `contexts/`; this just dispatches and
    // hands over the state the stateful contexts need.
    switch (widget.context) {
      case InputContext.text:
      case InputContext.accounts:
        return buildTextContext(
          context,
          widget,
          controller: _controller,
          obscured: _obscured,
          onToggleObscure: () => setState(() => _obscured = !_obscured),
        );
      case InputContext.currency:
        return buildCurrencyContext(
          context,
          widget,
          currency: _currency,
          onCurrencyChange: (code) {
            setState(() => _currency = code);
            widget.onCurrencyChanged?.call(code);
          },
        );
      case InputContext.date:
        return buildDateContext(context, widget);
      case InputContext.select:
        return buildSelectContext(context, widget);
    }
  }
}
