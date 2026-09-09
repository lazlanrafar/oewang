import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:oewang/data/services/api/auth_interceptor.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

class Storage extends Mock implements SecureStorageService {}

class RecordingHandler extends RequestInterceptorHandler {
  RequestOptions? accepted;
  DioException? rejected;
  @override
  void next(RequestOptions options) {
    accepted = options;
  }

  @override
  void reject(
    DioException error, [
    bool callFollowingErrorInterceptor = false,
  ]) {
    rejected = error;
  }
}

class RecordingErrorHandler extends ErrorInterceptorHandler {
  @override
  void next(DioException error) {}
}

void main() {
  String token(String ws) =>
      'header.${base64Url.encode(utf8.encode(jsonEncode({'workspace_id': ws})))}.signature';
  test(
    'should reject sync before sending when the stored token belongs to another workspace',
    () async {
      final storage = Storage();
      when(
        () => storage.readToken('session'),
      ).thenAnswer((_) async => token('ws2'));
      final interceptor = AuthInterceptor(
        storage: storage,
        sessionKey: 'session',
      );
      final handler = RecordingHandler();
      await interceptor.onRequest(
        RequestOptions(
          path: '/transactions/bulk',
          extra: {'workspaceId': 'ws1'},
        ),
        handler,
      );
      expect(handler.rejected?.type, DioExceptionType.cancel);
      expect(handler.accepted, isNull);
    },
  );
  test(
    'should attach the matching token when the sync workspace matches',
    () async {
      final storage = Storage();
      when(
        () => storage.readToken('session'),
      ).thenAnswer((_) async => token('ws1'));
      final interceptor = AuthInterceptor(
        storage: storage,
        sessionKey: 'session',
      );
      final handler = RecordingHandler();
      await interceptor.onRequest(
        RequestOptions(
          path: '/transactions/bulk',
          extra: {'workspaceId': 'ws1'},
        ),
        handler,
      );
      expect(handler.rejected, isNull);
      expect(
        handler.accepted!.headers['Authorization'],
        'Bearer ${token('ws1')}',
      );
    },
  );

  for (final value in <String?>[null, 'invalid-token']) {
    test(
      'should reject sync safely when the session token is $value',
      () async {
        final storage = Storage();
        when(() => storage.readToken('session')).thenAnswer((_) async => value);
        final interceptor = AuthInterceptor(
          storage: storage,
          sessionKey: 'session',
        );
        final handler = RecordingHandler();
        await interceptor.onRequest(
          RequestOptions(path: '/wallets', extra: {'workspaceId': 'ws'}),
          handler,
        );
        expect(handler.rejected?.type, DioExceptionType.cancel);
        expect(handler.accepted, isNull);
      },
    );
  }
  test(
    'should retain the new session when an old request returns unauthorized',
    () async {
      final storage = Storage();
      when(
        () => storage.readToken('session'),
      ).thenAnswer((_) async => token('ws2'));
      var cleared = false;
      final interceptor = AuthInterceptor(
        storage: storage,
        sessionKey: 'session',
        onUnauthorized: () async {
          cleared = true;
        },
      );
      final request = RequestOptions(
        path: '/wallets',
        headers: {'Authorization': 'Bearer ${token('ws1')}'},
      );
      await interceptor.onError(
        DioException(
          requestOptions: request,
          response: Response<dynamic>(requestOptions: request, statusCode: 401),
        ),
        RecordingErrorHandler(),
      );
      verifyNever(() => storage.deleteToken('session'));
      expect(cleared, false);
    },
  );
}
