import 'package:dio/dio.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/services/api/auth_interceptor.dart';
import 'package:oewang/data/services/api/encryption_interceptor.dart';
import 'package:oewang/data/services/api/oewang_crypto.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

/// The single Dio wrapper for the app. Only this file may import `dio`.
class ApiClient {
  ApiClient(this._dio);

  factory ApiClient.build({
    required EnvConfig env,
    required SecureStorageService storage,
    Future<void> Function()? onUnauthorized,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: '${env.apiUrl}/v1',
        contentType: 'application/json',
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );

    dio.interceptors.add(
      AuthInterceptor(
        storage: storage,
        sessionKey: env.sessionCookieName,
        onUnauthorized: onUnauthorized,
      ),
    );

    if (env.encryptionKey.length == 32) {
      dio.interceptors.add(
        EncryptionInterceptor(crypto: OewangCrypto(secret: env.encryptionKey)),
      );
    }

    return ApiClient(dio);
  }

  final Dio _dio;

  Dio get raw => _dio;

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) => _dio.get<dynamic>(path, queryParameters: queryParameters);

  Future<Response<dynamic>> post(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) => _dio.post<dynamic>(path, data: data, queryParameters: queryParameters);

  Future<Response<dynamic>> put(String path, {Object? data}) =>
      _dio.put<dynamic>(path, data: data);

  Future<Response<dynamic>> patch(String path, {Object? data}) =>
      _dio.patch<dynamic>(path, data: data);

  Future<Response<dynamic>> delete(String path) => _dio.delete<dynamic>(path);
}
