import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/wallet_totals.dart';

/// The `GET /v1/wallets/totals` wire shape; decimal strings stay exact (D12).
WalletTotals walletTotalsFromJson(
  Map<String, dynamic> json, {
  bool isEstimate = false,
}) {
  final currency = json['currency_code'] as String;
  Money money(Object? v) => Money.parse(v! as String, currency: currency);
  return WalletTotals(
    total: money(json['total']),
    assets: money(json['assets']),
    liabilities: money(json['liabilities']),
    leftOut: json['left_out'] as int? ?? 0,
    groups: [
      for (final g in (json['groups'] as List?) ?? const [])
        GroupTotal(
          id: (g as Map<String, dynamic>)['id'] as String?,
          subtotal: money(g['subtotal']),
          leftOut: g['left_out'] as int? ?? 0,
        ),
    ],
    isEstimate: isEstimate,
  );
}
