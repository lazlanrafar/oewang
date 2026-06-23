import 'package:oewang/domain/models/sub_currency.dart';

class SubCurrencyDto {
  const SubCurrencyDto({required this.id, required this.currencyCode});

  factory SubCurrencyDto.fromJson(Map<String, dynamic> json) {
    return SubCurrencyDto(
      id: json['id'] as String,
      currencyCode:
          (json['currencyCode'] ?? json['currency_code']) as String,
    );
  }

  final String id;
  final String currencyCode;

  SubCurrency toDomain() =>
      SubCurrency(id: id, currencyCode: currencyCode);
}
