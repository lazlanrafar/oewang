import 'package:decimal/decimal.dart';
import 'package:oewang/domain/models/wallet.dart';

/// Wire model for `WalletView` (`GET /v1/wallets`). `balance` is a decimal
/// string on the wire and stays exact (D12).
class WalletDto {
  const WalletDto({
    required this.id,
    required this.name,
    required this.balance,
    required this.currency,
    this.groupId,
    this.isIncludedInTotals = true,
  });

  factory WalletDto.fromJson(Map<String, dynamic> json) {
    return WalletDto(
      id: json['id'] as String,
      name: json['name'] as String,
      groupId: json['group_id'] as String?,
      balance: Decimal.parse(json['balance'] as String),
      currency: json['currency_code'] as String,
      isIncludedInTotals: json['is_included_in_totals'] as bool? ?? true,
    );
  }

  final String id;
  final String name;
  final String? groupId;
  final Decimal balance;
  final String currency;
  final bool isIncludedInTotals;

  Wallet toDomain() => Wallet(
    id: id,
    name: name,
    groupId: groupId,
    balance: balance,
    currency: currency,
    isIncludedInTotals: isIncludedInTotals,
  );
}
