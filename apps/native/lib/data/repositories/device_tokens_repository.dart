import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

/// This device's FCM token on the API (PUSH-1, D116). Both routes need a
/// session with a workspace: the change is audited in it.
abstract class DeviceTokensRepository {
  /// `POST /v1/device-tokens`. [platform] is `ios` or `android`.
  Future<Result<void, AppError>> register({
    required String token,
    required String platform,
  });

  /// `DELETE /v1/device-tokens`, on sign-out. The token goes in the body:
  /// a path reaches access logs.
  Future<Result<void, AppError>> unregister(String token);
}
