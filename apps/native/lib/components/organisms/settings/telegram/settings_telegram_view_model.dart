import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/telegram_repository.dart';

/// The Telegram entry in Settings (MOB-9, D83). Linking finishes in
/// Telegram, so the screen reloads the status when the app comes back.
class TelegramViewModel extends ChangeNotifier {
  TelegramViewModel({
    required TelegramRepository telegram,
    required Future<bool> Function(Uri link) openLink,
  }) : _telegram = telegram,
       _openLink = openLink;

  final TelegramRepository _telegram;
  final Future<bool> Function(Uri link) _openLink;

  TelegramStatus? status;
  AppError? error;
  bool busy = false;

  Future<void> load() async {
    final res = await _telegram.status();
    switch (res) {
      case Success(:final value):
        status = value;
        error = null;
      case Failure(error: final e):
        error = e;
    }
    notifyListeners();
  }

  /// Opens the one-time `t.me` link in Telegram.
  Future<void> link() => _busy(() async {
    final res = await _telegram.linkToken();
    switch (res) {
      case Success(:final value):
        if (!await _openLink(value)) {
          error = const UnknownError('Could not open Telegram');
        }
      case Failure(error: final e):
        error = e;
    }
  });

  Future<void> unlink() => _busy(() async {
    final res = await _telegram.unlink();
    if (res case Failure(error: final e)) {
      error = e;
      return;
    }
    await load();
  });

  Future<void> _busy(Future<void> Function() action) async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();
    await action();
    busy = false;
    notifyListeners();
  }
}
