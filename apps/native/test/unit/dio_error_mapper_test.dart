import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';

DioException _refused(
  String code,
  String message, {
  Map<String, Object?>? details,
}) {
  final options = RequestOptions(path: '/wallets');
  return DioException(
    requestOptions: options,
    response: Response(
      requestOptions: options,
      statusCode: 403,
      data: {
        'error': {
          'code': code,
          'message': message,
          if (details != null) 'details': details,
        },
      },
    ),
  );
}

void main() {
  // CSL-5, CSL-7
  test('a suspended workspace and a disabled account read as plain words', () {
    final suspended = mapDioError(
      _refused('WORKSPACE_SUSPENDED', 'this workspace is suspended'),
    );
    expect(suspended, isA<ServerError>());
    expect(suspended.code, 'WORKSPACE_SUSPENDED');
    expect(suspended.message, contains('suspended by Oewang'));

    final disabled = mapDioError(
      _refused('USER_DISABLED', 'this account is disabled'),
    );
    expect(disabled.message, 'This account is disabled. Contact Oewang support.');
  });

  // PLN-7
  test('a plan refusal names the limit or the feature in plain words', () {
    final tokens = mapDioError(
      _refused('QUOTA_TOKENS_EXCEEDED', 'monthly token limit reached'),
    );
    expect(tokens.code, 'QUOTA_TOKENS_EXCEEDED');
    expect(tokens.message, contains('AI tokens for this month'));

    final storage = mapDioError(
      _refused('QUOTA_STORAGE_EXCEEDED', 'storage limit reached'),
    );
    expect(storage.message, contains('storage is full'));

    final feature = mapDioError(
      _refused(
        'FEATURE_NOT_IN_PLAN',
        'the workspace plan does not include telegram',
        details: {'feature': 'telegram'},
      ),
    );
    expect(feature.message, contains('does not include Telegram'));

    final unknown = mapDioError(
      _refused('FEATURE_NOT_IN_PLAN', 'not in plan', details: {'feature': 'x'}),
    );
    expect(unknown.message, contains('does not include this feature'));
  });

  test('any other refusal keeps the API message', () {
    final other = mapDioError(_refused('INSUFFICIENT_ROLE', 'insufficient role'));
    expect(other.message, 'insufficient role');
  });
}
