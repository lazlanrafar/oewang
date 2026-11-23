import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class Workspace extends Equatable {
  const Workspace({
    required this.id,
    required this.name,
    this.currencyCode = '',
  });

  final String id;
  final String name;

  /// The workspace's base currency (ISO 4217).
  final String currencyCode;

  @override
  List<Object?> get props => [id, name, currencyCode];
}
