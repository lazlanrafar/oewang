import 'package:oewang/domain/models/wallet.dart';

class WalletDto {
  const WalletDto({
    required this.id,
    required this.name,
    this.groupId,
    this.balance = 0,
    this.currency = 'IDR',
  });

  factory WalletDto.fromJson(Map<String, dynamic> json) {
    return WalletDto(
      id: json['id'] as String,
      name: json['name'] as String,
      groupId: (json['groupId'] ?? json['group_id']) as String?,
      balance: _readNum(json['balance']),
      currency: (json['currency'] as String?) ?? 'IDR',
    );
  }

  final String id;
  final String name;
  final String? groupId;
  final num balance;
  final String currency;

  Wallet toDomain() => Wallet(
    id: id,
    name: name,
    groupId: groupId,
    balance: balance,
    currency: currency,
  );

  static num _readNum(Object? v) {
    if (v is num) return v;
    if (v is String) return num.tryParse(v) ?? 0;
    return 0;
  }
}
