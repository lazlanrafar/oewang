import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

/// The caller's own Telegram link in the session's workspace (D83, MOB-9).
class TelegramStatus {
  const TelegramStatus({
    required this.enabled,
    required this.linked,
    this.botUsername,
    this.telegramUsername,
  });

  factory TelegramStatus.fromJson(Map<String, dynamic> json) => TelegramStatus(
    enabled: json['enabled'] == true,
    linked: json['linked'] == true,
    botUsername: json['bot_username'] as String?,
    telegramUsername: json['telegram_username'] as String?,
  );

  /// False when the API has no bot configured.
  final bool enabled;
  final bool linked;
  final String? botUsername;
  final String? telegramUsername;
}

abstract class TelegramRepository {
  /// `GET /v1/integrations/telegram`.
  Future<Result<TelegramStatus, AppError>> status();

  /// `POST /v1/integrations/telegram/link-token`: a one-time `t.me` link,
  /// good for ten minutes (D85).
  Future<Result<Uri, AppError>> linkToken();

  /// `POST /v1/integrations/telegram/unlink`.
  Future<Result<void, AppError>> unlink();
}
