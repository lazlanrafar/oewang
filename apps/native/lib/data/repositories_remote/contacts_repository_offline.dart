import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/domain/models/contact.dart';

/// Read-only cache decorator — contacts aren't offline-writable in v1, this
/// just keeps the debt form's contact picker (and offline debt creation's
/// `contactName` resolution) working offline. `create` still requires
/// connectivity.
class ContactsRepositoryOffline implements ContactsRepository {
  ContactsRepositoryOffline({
    required ContactsRepository remote,
    required AppDatabase db,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _workspaceId = workspaceId;

  final ContactsRepository _remote;
  final AppDatabase _db;
  final String Function() _workspaceId;

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) async {
    final ws = _workspaceId();
    final result = await _remote.list(search: search);
    if (ws != _workspaceId()) return const Failure(UnauthorizedError());
    if (result case Success<List<Contact>, AppError>(value: final contacts)) {
      await _cache(ws, contacts);
      return result;
    }
    if (result case Failure<List<Contact>, AppError>(error: NetworkError())) {
      return Success(await _readCached(ws, search));
    }
    return result;
  }

  @override
  Future<Result<Contact, AppError>> create({required String name}) =>
      _remote.create(name: name);

  Future<void> _cache(String ws, List<Contact> contacts) async {
    if (contacts.isEmpty) return;
    await _db.batch((b) {
      for (final c in contacts) {
        b.insert(
          _db.cachedContacts,
          CachedContactsCompanion.insert(
            id: c.id,
            workspaceId: ws,
            name: c.name,
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
  }

  Future<List<Contact>> _readCached(String ws, String? search) async {
    final rows = await (_db.select(
      _db.cachedContacts,
    )..where((t) => t.workspaceId.equals(ws))).get();
    final contacts = rows.map((r) => Contact(id: r.id, name: r.name)).toList();
    if (search == null || search.isEmpty) return contacts;
    final q = search.toLowerCase();
    return contacts.where((c) => c.name.toLowerCase().contains(q)).toList();
  }
}
