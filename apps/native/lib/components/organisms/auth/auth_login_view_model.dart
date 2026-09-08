import 'package:flutter/foundation.dart';
import 'package:oewang/core/command/command.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/domain/models/session.dart';

class LoginInput {
  const LoginInput({required this.email, required this.password});
  final String email;
  final String password;
}

class LoginViewModel extends ChangeNotifier {
  LoginViewModel(this._repo) {
    submit = Command<LoginInput, Session>(
      (input) => _repo.login(email: input.email, password: input.password),
    )..addListener(_onCommandChanged);
    oauthSignIn = Command<String, Session>(_repo.loginWithOAuth)
      ..addListener(_onCommandChanged);
  }

  final AuthRepository _repo;

  late final Command<LoginInput, Session> submit;
  late final Command<String, Session> oauthSignIn;

  Future<Result<Session, AppError>?> signInWithOAuth(String provider) async {
    await oauthSignIn.run(provider);
    final s = oauthSignIn.result;
    if (s != null) return Success<Session, AppError>(s);
    final e = oauthSignIn.error;
    if (e != null) return Failure<Session, AppError>(e);
    return null;
  }

  String _email = '';
  String _password = '';

  String get email => _email;
  String get password => _password;

  bool get canSubmit =>
      _email.contains('@') && _password.length >= 6 && !submit.running;

  String? get errorMessage => submit.error?.message;

  void setEmail(String value) {
    _email = value.trim();
    notifyListeners();
  }

  void setPassword(String value) {
    _password = value;
    notifyListeners();
  }

  Future<Result<Session, AppError>?> run() async {
    if (!canSubmit) return null;
    await submit.run(LoginInput(email: _email, password: _password));
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
    oauthSignIn
      ..removeListener(_onCommandChanged)
      ..dispose();
    super.dispose();
  }
}
