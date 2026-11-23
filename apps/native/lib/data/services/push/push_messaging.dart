import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// The platform half of push: FCM and the local notification plugin. The
/// rules live in PushService; this is faked in tests.
abstract class PushMessaging {
  /// `ios` or `android`, as `POST /v1/device-tokens` names it.
  String get platform;

  /// Asks to show notifications. False when the person said no.
  Future<bool> requestPermission();

  /// This device's FCM token. A credential for pushing to it: never logged.
  Future<String?> token();

  Stream<String> get tokenRefresh;

  /// `data.route` of each push tapped while the app is running, in the
  /// background or the foreground.
  Stream<String?> get tapped;

  /// `data.route` of the push whose tap launched the app, if one did.
  Future<String?> launchedFrom();
}

class FirebasePushMessaging implements PushMessaging {
  final _local = FlutterLocalNotificationsPlugin();
  final _taps = StreamController<String?>.broadcast();
  Future<void>? _localReady;

  FirebaseMessaging get _fcm => FirebaseMessaging.instance;

  @override
  String get platform => Platform.isIOS ? 'ios' : 'android';

  @override
  Future<bool> requestPermission() async {
    final settings = await _fcm.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return false;
    }
    await (_localReady ??= _initLocal());
    return true;
  }

  @override
  Future<String?> token() => _fcm.getToken();

  @override
  Stream<String> get tokenRefresh => _fcm.onTokenRefresh;

  @override
  late final Stream<String?> tapped = () {
    FirebaseMessaging.onMessageOpenedApp.map(_route).listen(_taps.add);
    return _taps.stream;
  }();

  @override
  Future<String?> launchedFrom() async {
    final message = await _fcm.getInitialMessage();
    if (message != null) return _route(message);
    // A foreground notification this app showed, tapped after it was closed.
    final details = await _local.getNotificationAppLaunchDetails();
    return details?.didNotificationLaunchApp ?? false
        ? details!.notificationResponse?.payload
        : null;
  }

  /// FCM shows nothing while the app is open; the local plugin does, with
  /// the route as its payload so a tap opens the same screen.
  Future<void> _initLocal() async {
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        // Permission was asked through FCM already.
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (r) => _taps.add(r.payload),
    );
    FirebaseMessaging.onMessage.listen(_showForeground);
  }

  Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    await _local.show(
      id: message.messageId?.hashCode ?? message.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'oewang_channel_default',
          'General Notifications',
          channelDescription: 'Receipts, imports, budgets and invitations',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: _route(message),
    );
  }

  static String? _route(RemoteMessage message) =>
      message.data['route'] as String?;
}
