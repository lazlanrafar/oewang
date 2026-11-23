import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class WalletGroup extends Equatable {
  const WalletGroup({required this.id, required this.name});
  final String id;
  final String name;
  @override
  List<Object?> get props => [id, name];
}
