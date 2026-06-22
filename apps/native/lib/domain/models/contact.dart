import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// A debtor/creditor the workspace tracks debts against.
@immutable
class Contact extends Equatable {
  const Contact({required this.id, required this.name, this.email, this.phone});

  final String id;
  final String name;
  final String? email;
  final String? phone;

  @override
  List<Object?> get props => [id, name, email, phone];
}
