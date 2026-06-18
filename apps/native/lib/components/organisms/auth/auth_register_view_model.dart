import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/domain/models/session.dart';

class RegisterInput {
  const RegisterInput({
    required this.name,
    required this.email,
    required this.password,
  });
  final String name;
  final String email;
  final String password;
}

class RegisterViewModel extends ChangeNotifier {
  RegisterViewModel(this._repo) {
    submit = Command<RegisterInput, Session>(
      (input) => _repo.register(
        name: input.name,
        email: input.email,
        password: input.password,
      ),
    )..addListener(_onCommandChanged);
  }

  final AuthRepository _repo;

  late final Command<RegisterInput, Session> submit;

  String _name = '';
  String _email = '';
  String _password = '';
  String _confirm = '';

  bool get canSubmit =>
      _name.trim().isNotEmpty &&
      _email.contains('@') &&
      _password.length >= 6 &&
      _password == _confirm &&
      !submit.running;

  /// Local validation hint shown under the confirm field.
  String? get mismatchMessage =>
      _confirm.isNotEmpty && _password != _confirm
          ? 'Passwords do not match'
          : null;

  String? get errorMessage => submit.error?.message;

  void setName(String value) {
    _name = value;
    notifyListeners();
  }

  void setEmail(String value) {
    _email = value.trim();
    notifyListeners();
  }

  void setPassword(String value) {
    _password = value;
    notifyListeners();
  }

  void setConfirm(String value) {
    _confirm = value;
    notifyListeners();
  }

  Future<Result<Session, AppError>?> run() async {
    if (!canSubmit) return null;
    await submit.run(
      RegisterInput(name: _name.trim(), email: _email, password: _password),
    );
    final s = submit.result;
    if (s != null) return Success<Session, AppError>(s);
    final e = submit.error;
    if (e != null) return Failure<Session, AppError>(e);
    return null;
  }

  void _onCommandChanged() => notifyListeners();

  @override
  void dispose() {
    submit
      ..removeListener(_onCommandChanged)
      ..dispose();
    super.dispose();
  }
}
