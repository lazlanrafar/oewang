import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/passkeys_repository.dart';
import 'package:oewang/data/services/passkeys/passkey_authenticator.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:passkeys/types.dart' show PasskeyAuthCancelledException;

final passkeyViewModelProvider =
    ChangeNotifierProvider.autoDispose<PasskeyViewModel>((ref) {
      final vm = PasskeyViewModel(
        passkeys: ref.watch(passkeysRepositoryProvider),
        device: ref.watch(devicePasskeysProvider),
      );
      unawaited(vm.init());
      return vm;
    });

/// Signing in with a passkey and adding one (AUTH-14, D110, MOB-9): the API
/// starts a ceremony, the device's prompt answers it, the API finishes it.
class PasskeyViewModel extends ChangeNotifier {
  PasskeyViewModel({
    required PasskeysRepository passkeys,
    required DevicePasskeys device,
  }) : _passkeys = passkeys,
       _device = device;

  final PasskeysRepository _passkeys;
  final DevicePasskeys _device;

  /// Hides every passkey control where the device or the API cannot do it.
  bool supported = false;
  bool running = false;
  String? error;

  bool _disposed = false;

  Future<void> init() async {
    supported = await _device.supported();
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// A session, or null when the person cancelled or it failed ([error]).
  Future<Session?> signIn() => _run(() async {
    final (:ceremonyId, :options) = _opened(await _passkeys.signInStart());
    final finished = await _passkeys.signInFinish(
      ceremonyId,
      await _device.get(options),
    );
    return finished.fold((s) => s, (e) => throw _Refused(e.message));
  });

  /// True once a passkey for this account is on the device and the API.
  Future<bool> add() async =>
      await _run(() async {
        final (:ceremonyId, :options) = _opened(
          await _passkeys.registerStart(),
        );
        final finished = await _passkeys.registerFinish(
          ceremonyId,
          await _device.create(options),
        );
        return finished.fold((_) => true, (e) => throw _Refused(e.message));
      }) ??
      false;

  static PasskeyCeremony _opened(Result<PasskeyCeremony, AppError> started) =>
      switch (started) {
        Success(:final value) => value,
        Failure(:final error) => throw _Refused(error.message),
      };

  Future<T?> _run<T>(Future<T> Function() ceremony) async {
    if (running) return null;
    running = true;
    error = null;
    notifyListeners();
    try {
      return await ceremony();
    } on PasskeyAuthCancelledException {
      return null;
    } on _Refused catch (e) {
      error = e.message;
      return null;
    } on Exception {
      error = 'The passkey could not be used.';
      return null;
    } finally {
      running = false;
      notifyListeners();
    }
  }
}

class _Refused implements Exception {
  const _Refused(this.message);
  final String message;
}
