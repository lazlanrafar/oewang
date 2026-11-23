import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';

class FeedbackFormState {
  const FeedbackFormState({
    this.type = FeedbackType.bug,
    this.message = '',
    this.screenshot,
  });

  final FeedbackType type;
  final String message;
  final File? screenshot;

  FeedbackFormState copyWith({
    FeedbackType? type,
    String? message,
    File? screenshot,
    bool clearScreenshot = false,
  }) => FeedbackFormState(
    type: type ?? this.type,
    message: message ?? this.message,
    screenshot: clearScreenshot ? null : (screenshot ?? this.screenshot),
  );
}

/// Owns the feedback form state and the Send command. Fire-and-forget — there
/// is no list/history view on native, just a success/error signal.
class FeedbackFormViewModel extends ChangeNotifier {
  FeedbackFormViewModel({required FeedbackRepository feedback})
    : _feedback = feedback {
    save = Command<void, void>(_runSave)..addListener(notifyListeners);
  }

  final FeedbackRepository _feedback;

  FeedbackFormState _state = const FeedbackFormState();
  late final Command<void, void> save;

  FeedbackFormState get state => _state;
  bool get canSave => _state.message.trim().isNotEmpty && !save.running;

  void setType(FeedbackType type) {
    _state = _state.copyWith(type: type);
    notifyListeners();
  }

  void setMessage(String value) {
    _state = _state.copyWith(message: value);
    notifyListeners();
  }

  void setScreenshot(File? file) {
    _state = _state.copyWith(screenshot: file, clearScreenshot: file == null);
    notifyListeners();
  }

  Future<void> submit() => save.run(null);

  Future<Result<void, AppError>> _runSave(void _) => _feedback.submit(
    type: _state.type,
    message: _state.message.trim(),
    screenshot: _state.screenshot,
  );

  @override
  void dispose() {
    save
      ..removeListener(notifyListeners)
      ..dispose();
    super.dispose();
  }
}
