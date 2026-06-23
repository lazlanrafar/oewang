import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/contact_dto.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/contact.dart';

class ContactsRepositoryRemote implements ContactsRepository {
  ContactsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) async {
    try {
      final res = await _api.get(
        '/contacts',
        queryParameters: {
          'limit': 100,
          if (search != null && search.isNotEmpty) 'search': search,
        },
      );
      final body = res.data;
      final data = body is Map<String, dynamic> ? body['data'] : null;
      if (data is! List) return const Success<List<Contact>, AppError>([]);
      final contacts = data
          .whereType<Map<String, dynamic>>()
          .map(ContactDto.fromJson)
          .map((d) => d.toDomain())
          .toList();
      return Success(contacts);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<Contact, AppError>> create({required String name}) async {
    try {
      final res = await _api.post('/contacts', data: {'name': name});
      final body = res.data;
      final data = body is Map<String, dynamic> ? body['data'] : null;
      if (data is! Map<String, dynamic>) {
        return const Failure(UnknownError());
      }
      return Success(ContactDto.fromJson(data).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
