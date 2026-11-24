import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/domain/models/contact.dart';

/// In memory. [withDebts] names the contacts the API would refuse to delete
/// (CON-3).
class ContactsRepositoryFake implements ContactsRepository {
  ContactsRepositoryFake({List<Contact>? seed, this.withDebts = const {}})
    : _store = [...?seed];

  final List<Contact> _store;
  final Set<String> withDebts;
  final List<(String, String)> merged = [];
  int _seq = 0;

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) async {
    final q = search?.toLowerCase() ?? '';
    return Success([
      for (final c in _store)
        if (c.name.toLowerCase().contains(q)) c,
    ]);
  }

  @override
  Future<Result<Contact, AppError>> create({
    required String name,
    String? email,
    String? phone,
    String? note,
  }) async {
    final c = Contact(
      id: 'contact-${++_seq}',
      name: name.trim(),
      email: email,
      phone: phone,
      note: note,
    );
    _store.add(c);
    return Success(c);
  }

  @override
  Future<Result<Contact, AppError>> update({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? note,
  }) async {
    final i = _store.indexWhere((c) => c.id == id);
    if (i == -1) return const Failure(UnknownError('Contact not found'));
    return Success(
      _store[i] = Contact(
        id: id,
        name: name.trim(),
        email: email,
        phone: phone,
        note: note,
      ),
    );
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    if (withDebts.contains(id)) {
      return const Failure(
        ServerError(
          statusCode: 409,
          message: 'This contact still has debts',
          code: 'CONTACT_HAS_DEBTS',
        ),
      );
    }
    _store.removeWhere((c) => c.id == id);
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> merge({
    required String id,
    required String intoId,
  }) async {
    if (id == intoId) {
      return const Failure(
        ServerError(
          statusCode: 422,
          message: 'Pick another contact',
          code: 'CONTACT_MERGE_SELF',
        ),
      );
    }
    merged.add((id, intoId));
    _store.removeWhere((c) => c.id == id);
    return const Success(null);
  }
}
