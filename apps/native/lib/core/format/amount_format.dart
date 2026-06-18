import 'package:intl/intl.dart';

/// Locale-aware helpers for formatting a raw [num] amount as the user types.
///
/// Unlike [Money.format], which always pads to a fixed number of decimals
/// ("Rp 1.000.000,00"), this formats for live editing inside the amount keypad:
/// thousands are grouped ("1.000.000") and decimals are only shown when the
/// user actually entered them. Matches the WMoney-style behaviour where the
/// value appears in the form field while the keypad is open.
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
  /// When [decimals] is provided it forces exactly that many decimal places
  /// (so the workspace "Decimal point" setting can drive it later).
  static String number(
    num value, {
    String locale = 'id_ID',
    int maxDecimals = 2,
    int? decimals,
  }) {
    final pattern = decimals != null
        ? '#,##0${decimals > 0 ? '.${'0' * decimals}' : ''}'
        : '#,##0.${'#' * maxDecimals}';
    return NumberFormat(pattern, locale).format(value);
  }

  /// Full display string with the currency symbol, e.g. "Rp 1.000.000".
  static String currency(
    num value, {
    String currency = 'IDR',
    String locale = 'id_ID',
    int maxDecimals = 2,
    int? decimals,
    bool symbolFront = true,
  }) {
    final body = number(
      value,
      locale: locale,
      maxDecimals: maxDecimals,
      decimals: decimals,
    );
    final symbol = symbolFor(currency);
    return symbolFront ? '$symbol$body' : '$body ${symbol.trim()}';
  }
}
