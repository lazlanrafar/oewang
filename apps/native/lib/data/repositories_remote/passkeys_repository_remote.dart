import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/passkeys_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';

class PasskeysRepositoryRemote implements PasskeysRepository {
  PasskeysRepositoryRemote({required this.api, required this.storage});

  final ApiClient api;
  final SecureStorageService storage;

  @override
  Future<Result<PasskeyCeremony, AppError>> signInStart() =>
      _start('/auth/passkey/sign-in/start');

  @override
  Future<Result<Session, AppError>> signInFinish(
    String ceremonyId,
    Map<String, dynamic> credential,
  ) => openSession(
    storage,
    () => api.post(
      '/auth/passkey/sign-in/finish',
      data: {'ceremony_id': ceremonyId, 'credential': credential},
    ),
  );

  @override
  Future<Result<PasskeyCeremony, AppError>> registerStart() =>
      _start('/auth/passkeys/register/start');

  @override
  Future<Result<void, AppError>> registerFinish(
    String ceremonyId,
    Map<String, dynamic> credential,
  ) async {
    try {
      await api.post(
        '/auth/passkeys/register/finish',
        data: {
          'ceremony_id': ceremonyId,
          'name': null,
          'credential': credential,
        },
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  Future<Result<PasskeyCeremony, AppError>> _start(String path) async {
    try {
      final data = envelopeData(await api.post(path));
      if (data case {
        'ceremony_id': final String id,
        'options': final Map<String, dynamic> options,
      }) {
        return Success((ceremonyId: id, options: options));
      }
      return const Failure(UnknownError('Unexpected passkey response'));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
