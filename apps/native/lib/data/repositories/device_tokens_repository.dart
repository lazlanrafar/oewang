import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

abstract class DeviceTokensRepository {
  /// Registers this device's FCM token so the backend can push to it.
  Future<Result<void, AppError>> register({
    required String token,
    required String platform,
  });
}
