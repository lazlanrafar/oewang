import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// The person on the other side of a debt (CON-1).
@immutable
class Contact extends Equatable {
  const Contact({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.note,
  });

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? note;

  @override
  List<Object?> get props => [id, name, email, phone, note];
}
