import 'package:oewang/domain/models/wallet_group.dart';

class WalletGroupDto {
  const WalletGroupDto({required this.id, required this.name});

  factory WalletGroupDto.fromJson(Map<String, dynamic> json) {
    return WalletGroupDto(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }

  final String id;
  final String name;

  WalletGroup toDomain() => WalletGroup(id: id, name: name);
}
