import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/debt_dto.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/contact.dart';

/// `/v1/contacts*` (CON-1 to CON-4).
class ContactsRepositoryRemote implements ContactsRepository {
  ContactsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) =>
      apiCall(() async {
        final rows = await fetchAllPages(
          _api,
          '/contacts',
          query: {if (search != null && search.isNotEmpty) 'search': search},
        );
        return rows.map(contactFromJson).toList();
      });

  @override
  Future<Result<Contact, AppError>> create({
    required String name,
    String? email,
    String? phone,
    String? note,
  }) => apiCall(() async {
    final res = await _api.post(
      '/contacts',
      data: contactBody(name: name, email: email, phone: phone, note: note),
    );
    return contactFromJson(envelopeData(res)! as Map<String, dynamic>);
  });

  @override
  Future<Result<Contact, AppError>> update({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? note,
  }) => apiCall(() async {
    final res = await _api.patch(
      '/contacts/$id',
      data: contactBody(name: name, email: email, phone: phone, note: note),
    );
    return contactFromJson(envelopeData(res)! as Map<String, dynamic>);
  });

  @override
  Future<Result<void, AppError>> delete(String id) =>
      apiCall(() => _api.delete('/contacts/$id'));

  @override
  Future<Result<void, AppError>> merge({
    required String id,
    required String intoId,
  }) => apiCall(
    () => _api.post('/contacts/$id/merge', data: {'into_id': intoId}),
  );
}
