import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/contact.dart';

/// `/v1/contacts*` (CON-1 to CON-4, MOB-10).
abstract class ContactsRepository {
  Future<Result<List<Contact>, AppError>> list({String? search});

  Future<Result<Contact, AppError>> create({
    required String name,
    String? email,
    String? phone,
    String? note,
  });

  Future<Result<Contact, AppError>> update({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? note,
  });

  /// Refused with `CONTACT_HAS_DEBTS` while any live debt names it (CON-3).
  Future<Result<void, AppError>> delete(String id);

  /// Moves [id]'s debts to [intoId] and deletes [id] (CON-4).
  Future<Result<void, AppError>> merge({
    required String id,
    required String intoId,
  });
}
