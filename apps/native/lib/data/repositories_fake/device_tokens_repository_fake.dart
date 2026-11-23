import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';

class DeviceTokensRepositoryFake implements DeviceTokensRepository {
  DeviceTokensRepositoryFake([List<String>? log]) : log = log ?? [];

  /// `register <token> <platform>` and `unregister <token>`, in call order.
  final List<String> log;

  @override
  Future<Result<void, AppError>> register({
    required String token,
    required String platform,
  }) async {
    log.add('register $token $platform');
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> unregister(String token) async {
    log.add('unregister $token');
    return const Success(null);
  }
}
