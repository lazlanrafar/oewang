import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// One group's subtotal from `GET /v1/wallets/totals`; [id] is null for the
/// wallets in no group.
@immutable
class GroupTotal {
  const GroupTotal({
    required this.id,
    required this.subtotal,
    this.leftOut = 0,
  });
  final String? id;
  final Money subtotal;
  final int leftOut;
}

/// What the wallets add up to, in the workspace currency, as the API
/// computed it (MOB-4, D27, D117). The app never sums balances itself.
@immutable
class WalletTotals {
  const WalletTotals({
    required this.total,
    required this.assets,
    required this.liabilities,
    this.leftOut = 0,
    this.groups = const [],
    this.isEstimate = false,
  });

  final Money total;
  final Money assets;

  /// A positive figure; [total] is assets minus liabilities.
  final Money liabilities;

  /// Counted wallets with no rate for their currency today.
  final int leftOut;
  final List<GroupTotal> groups;

  /// The last answer seen while writes are still queued (MOB-6).
  final bool isEstimate;

  GroupTotal? group(String? id) {
    for (final g in groups) {
      if (g.id == id) return g;
    }
    return null;
  }
}
