import 'package:oewang/domain/models/category.dart';

class CategoryDto {
  const CategoryDto({
    required this.id,
    required this.name,
    required this.type,
    this.emoji,
  });

  factory CategoryDto.fromJson(Map<String, dynamic> json) {
    return CategoryDto(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
      emoji: json['emoji'] as String?,
    );
  }

  final String id;
  final String name;
  final String type;
  final String? emoji;

  Category toDomain() {
    return Category(
      id: id,
      name: name,
      type: type == 'income' ? CategoryType.income : CategoryType.expense,
      emoji: emoji,
    );
  }
}
