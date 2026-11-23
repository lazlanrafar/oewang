import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

/// A workspace the authenticated user belongs to, with their role.
@immutable
class WorkspaceMembership extends Equatable {
  const WorkspaceMembership({
    required this.id,
    required this.name,
    required this.role,
    this.slug,
    this.planName,
  });

  final String id;
  final String name;
  final String role;
  final String? slug;
  final String? planName;

  @override
  List<Object?> get props => [id, name, role, slug, planName];
}
