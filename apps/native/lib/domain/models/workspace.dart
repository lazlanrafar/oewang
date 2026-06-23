import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class Workspace extends Equatable {
  const Workspace({
    required this.id,
    required this.name,
    this.planStatus = 'free',
  });

  final String id;
  final String name;
  final String planStatus;

  @override
  List<Object?> get props => [id, name, planStatus];
}
