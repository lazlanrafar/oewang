import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';

DioException _refused(String code, String message) {
  final options = RequestOptions(path: '/wallets');
  return DioException(
    requestOptions: options,
    response: Response(
      requestOptions: options,
      statusCode: 403,
      data: {
        'error': {'code': code, 'message': message},
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

  test('any other refusal keeps the API message', () {
    final other = mapDioError(_refused('INSUFFICIENT_ROLE', 'insufficient role'));
    expect(other.message, 'insufficient role');
  });
}
