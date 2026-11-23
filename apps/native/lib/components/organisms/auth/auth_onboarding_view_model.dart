import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/workspace.dart';

/// Onboarding = create the first workspace, for a session that has none
/// (D109). The old plan step is gone with billing (D92).
class OnboardingViewModel extends ChangeNotifier {
  OnboardingViewModel({
    required AuthRepository auth,
    required WorkspacesRepository workspaces,
  }) : _auth = auth,
       _workspaces = workspaces;

  final AuthRepository _auth;
  final WorkspacesRepository _workspaces;

  String _name = '';
  CurrencyInfo _currency = CurrencyCatalog.all.firstWhere(
    (c) => c.code == 'IDR',
  );

  bool _submitting = false;
  AppError? _error;

  String get name => _name;
  CurrencyInfo get currency => _currency;
  bool get submitting => _submitting;
  String? get errorMessage => _error?.message;
  bool get canSubmit => _name.trim().isNotEmpty && !_submitting;

  void setName(String value) {
    _name = value;
    notifyListeners();
  }

  void setCurrency(CurrencyInfo c) {
    _currency = c;
    notifyListeners();
  }

  /// Creates the workspace (name and base currency, D109) then switches the
  /// session into it (WS-6). Returns the ready session, or null on failure.
  Future<Session?> submit() async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final created = await _workspaces.create(
        name: _name.trim(),
        currencyCode: _currency.code,
      );
      final workspace = created.fold<Workspace?>((w) => w, (e) {
        _error = e;
        return null;
      });
      if (workspace == null) return null;

      final switched = await _auth.switchWorkspace(workspace.id);
      return switched.fold<Session?>((s) => s, (e) {
        _error = e;
        return null;
      });
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }
}
