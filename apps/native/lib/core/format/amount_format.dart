import 'package:decimal/decimal.dart';
import 'package:intl/intl.dart';

/// Locale-aware formatting of a [Decimal] amount.
///
/// `NumberFormat` only takes a `num`, which would put every amount through a
/// double on its way to the screen (D12). So the digits come from the
/// decimal's own string and only the separators come from `intl`.
///
/// Unlike [Money.format], which always pads to a fixed number of decimals
/// ("Rp 1.000.000,00"), [number] formats for live editing inside the amount
/// keypad: thousands are grouped ("1.000.000") and decimals are only shown
/// when the value has them.
class AmountFormat {
  const AmountFormat._();

  /// Default symbol per ISO currency code, kept in sync with [Money].
  static String symbolFor(String currency) {
    switch (currency) {
      case 'IDR':
        return 'Rp ';
      case 'USD':
        return r'US$ ';
      case 'SGD':
        return r'S$ ';
      default:
        return '$currency ';
    }
  }

  /// Groups thousands and shows up to [maxDecimals] decimal places without
  /// trailing zeros, e.g. `1000000` -> "1.000.000", `1000.5` -> "1.000,5".
  ///
  /// When [decimals] is provided it forces exactly that many decimal places.
  /// Rounds half away from zero.
  static String number(
    Decimal value, {
    String locale = 'id_ID',
    int maxDecimals = 2,
    int? decimals,
  }) {
    final symbols = NumberFormat.decimalPattern(locale).symbols;
    final scale = decimals ?? maxDecimals;
    final rounded = value.round(scale: scale);
    final fixed = rounded.abs().toStringAsFixed(scale);

    final dot = fixed.indexOf('.');
    final whole = dot == -1 ? fixed : fixed.substring(0, dot);
    var fraction = dot == -1 ? '' : fixed.substring(dot + 1);
    if (decimals == null) fraction = fraction.replaceFirst(RegExp(r'0+$'), '');

    final grouped = StringBuffer();
    for (var i = 0; i < whole.length; i++) {
      if (i > 0 && (whole.length - i) % 3 == 0) {
        grouped.write(symbols.GROUP_SEP);
      }
      grouped.write(whole[i]);
    }

    final sign = rounded < Decimal.zero ? symbols.MINUS_SIGN : '';
    final tail = fraction.isEmpty ? '' : '${symbols.DECIMAL_SEP}$fraction';
    return '$sign$grouped$tail';
  }

  /// Full display string with the currency symbol, e.g. "Rp 1.000.000".
  static String currency(
    Decimal value, {
    String currency = 'IDR',
    String locale = 'id_ID',
    int maxDecimals = 2,
    int? decimals,
    bool symbolFront = true,
    bool useCode = false,
  }) {
    final body = number(
      value,
      locale: locale,
      maxDecimals: maxDecimals,
      decimals: decimals,
    );
    // Use the ISO code (e.g. "IDR") instead of the symbol (e.g. "Rp").
    final symbol = useCode ? '$currency ' : symbolFor(currency);
    return symbolFront ? '$symbol$body' : '$body ${symbol.trim()}';
  }
}
