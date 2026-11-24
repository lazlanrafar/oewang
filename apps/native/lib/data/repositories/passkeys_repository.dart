import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/session.dart';

/// One half-run WebAuthn ceremony: the ID that finishes it and the options
/// for the platform authenticator, as the API sent them.
typedef PasskeyCeremony = ({String ceremonyId, Map<String, dynamic> options});

/// Passkeys (AUTH-14, D110, MOB-9). Each ceremony is a start and a finish;
/// the device's authenticator runs in between.
abstract class PasskeysRepository {
  /// `POST /v1/auth/passkey/sign-in/start`. Public.
  Future<Result<PasskeyCeremony, AppError>> signInStart();

  /// `POST /v1/auth/passkey/sign-in/finish`. A session, as login answers.
  Future<Result<Session, AppError>> signInFinish(
    String ceremonyId,
    Map<String, dynamic> credential,
  );

  /// `POST /v1/auth/passkeys/register/start`, signed in.
  Future<Result<PasskeyCeremony, AppError>> registerStart();

  /// `POST /v1/auth/passkeys/register/finish`, unnamed: the API names it,
  /// as it does for the web.
  Future<Result<void, AppError>> registerFinish(
    String ceremonyId,
    Map<String, dynamic> credential,
  );
}
