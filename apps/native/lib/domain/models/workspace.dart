import 'package:decimal/decimal.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

@immutable
class Workspace extends Equatable {
  const Workspace({
    required this.id,
    required this.name,
    this.currencyCode = '',
    this.currencyLocked = false,
  });

  final String id;
  final String name;

  /// The workspace's base currency (ISO 4217).
  final String currencyCode;

  /// True once any transaction exists (WAL-6): the currency then changes
  /// only by converting the whole ledger (WAL-7).
  final bool currencyLocked;

  @override
  List<Object?> get props => [id, name, currencyCode, currencyLocked];
}

/// `GET /v1/workspaces/current/currency/preview`: what a conversion touches
/// and the rate to start from (WAL-7).
@immutable
class CurrencyPreview {
  const CurrencyPreview({
    required this.from,
    required this.to,
    required this.transactions,
    required this.budgets,
    this.suggestedRate,
  });

  final String from;
  final String to;

  /// Units of [to] per unit of [from]; null when no snapshot holds the pair.
  final Decimal? suggestedRate;
  final int transactions;
  final int budgets;
}

/// A row of `GET /v1/workspaces/current/members`.
@immutable
class WorkspaceMember extends Equatable {
  const WorkspaceMember({
    required this.userId,
    required this.email,
    required this.role,
    this.name,
  });

  final String userId;
  final String email;
  final String? name;

  /// `owner`, `admin` or `member`.
  final String role;

  @override
  List<Object?> get props => [userId, email, name, role];
}
