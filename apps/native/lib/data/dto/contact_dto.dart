import 'package:oewang/domain/models/contact.dart';

class ContactDto {
  const ContactDto({
    required this.id,
    required this.name,
    this.email,
    this.phone,
  });

  factory ContactDto.fromJson(Map<String, dynamic> json) => ContactDto(
    id: json['id'] as String,
    name: (json['name'] as String?) ?? '',
    email: json['email'] as String?,
    phone: json['phone'] as String?,
  );

  final String id;
  final String name;
  final String? email;
  final String? phone;

  Contact toDomain() => Contact(id: id, name: name, email: email, phone: phone);
}
