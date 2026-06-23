import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// A workspace sub-currency — just the persistent half. FX rates come from a
/// separate /rates endpoint and are joined client-side.
@immutable
class SubCurrency extends Equatable {
  const SubCurrency({required this.id, required this.currencyCode});

  final String id;
  final String currencyCode;

  @override
  List<Object?> get props => [id, currencyCode];
}
