import 'dart:async';

import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/core/router/push_route.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/domain/models/session.dart';

final _log = createLogger('push');

/// Keeps this device registered for push while a session is in a workspace,
/// and opens the screen a tapped push names (PUSH-1, D116).
///
/// The token is registered each time the session enters a workspace (sign-in,
/// creating, joining or switching to one): both device-token routes need a
/// workspace session, because the change is audited there. It is removed on
/// sign-out, before the session's tokens are cleared.
class PushService {
  PushService({
    required PushMessaging messaging,
    required DeviceTokensRepository deviceTokens,
    required void Function(String location) open,
  }) : _messaging = messaging,
       _deviceTokens = deviceTokens,
       _open = open;

  final PushMessaging _messaging;
  final DeviceTokensRepository _deviceTokens;
  final void Function(String location) _open;
  final _subs = <StreamSubscription<Object?>>[];

  /// The workspace the device was last registered from; null when signed
  /// out or in none.
  String? _workspaceId;

  /// This device's FCM token, once known. Memory only, never logged.
  String? _token;

  /// Null until the person has been asked.
  bool? _allowed;

  bool _started = false;

  /// Wires taps and token refresh. Runs once; later calls do nothing.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    _subs
      ..add(_messaging.tapped.listen((route) => _open(pushLocation(route))))
      ..add(
        _messaging.tokenRefresh.listen((token) async {
          _token = token;
          if (_workspaceId != null) await _register(token);
        }),
      );
    final launched = await _messaging.launchedFrom();
    if (launched != null) _open(pushLocation(launched));
  }

  /// Called on every session change.
  Future<void> sessionChanged(Session? session) async {
    final workspaceId = (session?.hasWorkspace ?? false)
        ? session!.workspaceId
        : null;
    if (workspaceId == _workspaceId) return;
    _workspaceId = workspaceId;
    if (workspaceId == null) return;

    try {
      // Asked once the person is in a workspace, not on the sign-in screen.
      _allowed ??= await _messaging.requestPermission();
      if (!_allowed!) return;
      final token = _token ??= await _messaging.token();
      // A newer change may have landed while waiting on the platform.
      if (token != null && _workspaceId == workspaceId) await _register(token);
    } on Exception {
      // Push is a convenience: no FCM (or no Firebase) never blocks sign-in.
      _log.warn('push unavailable');
    }
  }

  /// Removes this device from the API. Call while the session still holds
  /// its tokens; a failure never blocks signing out.
  Future<void> signingOut() async {
    _workspaceId = null;
    final token = _token;
    if (token == null) return;
    final res = await _deviceTokens.unregister(token);
    if (res.isErr) _log.warn('device token not removed');
  }

  Future<void> _register(String token) async {
    final res = await _deviceTokens.register(
      token: token,
      platform: _messaging.platform,
    );
    if (res.isErr) _log.warn('device token not registered');
  }

  Future<void> dispose() async {
    for (final sub in _subs) {
      await sub.cancel();
    }
  }
}
