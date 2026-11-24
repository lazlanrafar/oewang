import 'package:decimal/decimal.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/format/amount_format.dart';

/// An amount in one currency. Held as a [Decimal], exactly as the API's
/// decimal string said it (D12, MOB-4): a `double` amount is a bug.
@immutable
class Money extends Equatable {
  const Money({required this.amount, this.currency = 'IDR'});

  factory Money.zero({String currency = 'IDR'}) =>
      Money(amount: Decimal.zero, currency: currency);

  /// From the API's decimal string. A malformed string is a wire bug, not a
  /// zero, so it throws.
  factory Money.parse(String amount, {String currency = 'IDR'}) =>
      Money(amount: Decimal.parse(amount), currency: currency);

  final Decimal amount;
  final String currency;

  bool get isZero => amount == Decimal.zero;
  bool get isNegative => amount < Decimal.zero;

  Money operator +(Money other) =>
      Money(amount: amount + other.amount, currency: currency);

  Money operator -(Money other) =>
      Money(amount: amount - other.amount, currency: currency);

  Money negate() => Money(amount: -amount, currency: currency);

  /// Locale-aware string ("Rp 1.952.500,00" for IDR + id_ID). A negative
  /// amount puts the sign before the symbol ("-Rp 1.000,00"), as the old
  /// `NumberFormat.currency` did.
  String format({String locale = 'id_ID'}) {
    final body = AmountFormat.number(amount.abs(), locale: locale, decimals: 2);
    return '${isNegative ? '-' : ''}${AmountFormat.symbolFor(currency)}$body';
  }

  @override
  List<Object?> get props => [amount, currency];
}
