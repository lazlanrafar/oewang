import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/domain/models/contact.dart';

class ContactsRepositoryFake implements ContactsRepository {
  ContactsRepositoryFake({List<Contact> initial = const []})
      : _contacts = List.of(initial);

  final List<Contact> _contacts;
  int _counter = 0;

  /// Lowercased names whose `create` call should fail — simulates the
  /// backend's name-uniqueness 409.
  final Set<String> failNames = {};

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) async =>
      Success(List.of(_contacts));

  @override
  Future<Result<Contact, AppError>> create({
    required String name,
    String? phone,
  }) async {
    if (failNames.contains(name.toLowerCase())) {
      return const Failure(UnknownError());
    }
    _counter++;
    final contact = Contact(id: 'fake-contact-$_counter', name: name, phone: phone);
    _contacts.add(contact);
    return Success(contact);
  }
}
