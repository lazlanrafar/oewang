import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

enum CategoryType { income, expense }

@immutable
class Category extends Equatable {
  const Category({
    required this.id,
    required this.name,
    required this.type,
    this.emoji,
  });

  final String id;
  final String name;
  final CategoryType type;
  final String? emoji;

  @override
  List<Object?> get props => [id, name, type, emoji];
}
