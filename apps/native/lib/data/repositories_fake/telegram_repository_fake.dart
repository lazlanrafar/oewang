import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/telegram_repository.dart';

/// A bot named `oewang_bot`. Linking takes effect when the test says the
/// person finished in Telegram ([completeLink]), as the real chat does.
class TelegramRepositoryFake implements TelegramRepository {
  TelegramRepositoryFake({this.enabled = true});

  final bool enabled;
  bool linked = false;

  void completeLink() => linked = true;

  @override
  Future<Result<TelegramStatus, AppError>> status() async => Success(
    TelegramStatus(
      enabled: enabled,
      linked: linked,
      botUsername: enabled ? 'oewang_bot' : null,
      telegramUsername: linked ? 'someone' : null,
    ),
  );

  @override
  Future<Result<Uri, AppError>> linkToken() async {
    if (!enabled) {
      return const Failure(
        ServerError(
          statusCode: 422,
          code: 'TELEGRAM_DISABLED',
          message: 'Telegram is not set up.',
        ),
      );
    }
    return Success(Uri.parse('https://t.me/oewang_bot?start=one-time'));
  }

  @override
  Future<Result<void, AppError>> unlink() async {
    linked = false;
    return const Success(null);
  }
}
