import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class CurrencyInfo extends Equatable {
  const CurrencyInfo({
    required this.code,
    required this.country,
    required this.symbol,
  });

  final String code;
  final String country;
  final String symbol;

  String get displayLabel => '$code - $country ($symbol)';

  @override
  List<Object?> get props => [code, country, symbol];
}
