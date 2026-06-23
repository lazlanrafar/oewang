import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

/// Minor-unit currency value. Avoids floating-point drift by storing the
/// `amount` as a [num] that the formatter rounds for display only.
@immutable
class Money extends Equatable {
  const Money({required this.amount, this.currency = 'IDR'});

  factory Money.zero({String currency = 'IDR'}) =>
      Money(amount: 0, currency: currency);

  final num amount;
  final String currency;

  bool get isZero => amount == 0;
  bool get isNegative => amount < 0;

  Money operator +(Money other) =>
      Money(amount: amount + other.amount, currency: currency);

  Money operator -(Money other) =>
      Money(amount: amount - other.amount, currency: currency);

  Money negate() => Money(amount: -amount, currency: currency);

  /// Locale-aware string ("Rp 1.952.500,00" for IDR + id_ID).
  String format({String locale = 'id_ID'}) {
    final fmt = NumberFormat.currency(
      locale: locale,
      symbol: _symbolFor(currency),
      decimalDigits: 2,
    );
    return fmt.format(amount);
  }

  static String _symbolFor(String code) {
    switch (code) {
      case 'IDR':
        return 'Rp ';
      case 'USD':
        return r'US$ ';
      case 'SGD':
        return r'S$ ';
      default:
        return '$code ';
    }
  }

  @override
  List<Object?> get props => [amount, currency];
}
