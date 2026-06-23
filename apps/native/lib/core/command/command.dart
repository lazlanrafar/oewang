import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

/// Encapsulates an async UI action so every button gets consistent
/// disabled / spinner / error state.
class Command<Input, Output> extends ChangeNotifier {
  Command(this._action);

  final Future<Result<Output, AppError>> Function(Input) _action;

  bool _running = false;
  AppError? _error;
  Output? _result;

  bool get running => _running;
  AppError? get error => _error;
  Output? get result => _result;

  Future<void> run(Input input) async {
    if (_running) return;
    _running = true;
    _error = null;
    notifyListeners();

    final res = await _action(input);
    res.fold(
      (ok) => _result = ok,
      (e) => _error = e,
    );

    _running = false;
    notifyListeners();
  }

  void reset() {
    _running = false;
    _error = null;
    _result = null;
    notifyListeners();
  }
}
