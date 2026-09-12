import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';
import 'package:oewang/data/services/notifications/notifications_service.dart';

/// Must be a top-level (or static) function — FCM invokes it in a separate
/// isolate when a data message arrives while the app is backgrounded/killed.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // No-op for now: FCM already shows the notification tray entry itself for
  // background/terminated messages that carry a `notification` payload.
  // This handler exists so `FirebaseMessaging.onBackgroundMessage` has
  // somewhere to route data-only messages once the app needs them.
}

/// Requests notification permission, registers this device's FCM token with
/// the backend, and displays foreground pushes via [NotificationsService]
/// (FCM doesn't auto-show a system notification while the app is open).
class PushService {
  PushService({
    required NotificationsService notifications,
    required DeviceTokensRepository deviceTokens,
  }) : _notifications = notifications,
       _deviceTokens = deviceTokens;

  final NotificationsService _notifications;
  final DeviceTokensRepository _deviceTokens;
  bool _started = false;

  Future<void> start() async {
    if (_started) return;
    _started = true;

    await _notifications.init();

    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    await _notifications.requestPermissions();

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _register(token);

    FirebaseMessaging.instance.onTokenRefresh.listen(_register);

    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification == null) return;
      _notifications.showNotification(
        id: message.hashCode,
        title: notification.title ?? '',
        body: notification.body ?? '',
        payload: message.data['url'] as String?,
      );
    });
  }

  Future<void> _register(String token) async {
    await _deviceTokens.register(
      token: token,
      platform: Platform.isIOS ? 'ios' : 'android',
    );
  }
}
