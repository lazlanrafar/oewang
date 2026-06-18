import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/dto/currency_catalog.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/domain/models/currency.dart';
import 'package:oewang/domain/models/session.dart';

/// Onboarding = create a workspace on the Free plan. Paid plans are purchased
/// later on the web (see the upgrade banner on the home screen).
class OnboardingViewModel extends ChangeNotifier {
  OnboardingViewModel({
    required AuthRepository auth,
    required WorkspacesRepository workspaces,
  }) : _auth = auth,
       _workspaces = workspaces;

  final AuthRepository _auth;
  final WorkspacesRepository _workspaces;

  String _name = '';
  CurrencyInfo _currency =
      CurrencyCatalog.all.firstWhere((c) => c.code == 'IDR');

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

  /// Creates the workspace then refreshes the JWT so it carries the new
  /// workspace_id. Returns the ready session, or null on failure.
  Future<Session?> submit() async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final created = await _workspaces.create(
        name: _name.trim(),
        mainCurrencyCode: _currency.code,
        mainCurrencySymbol: _currency.symbol,
      );
      final workspace = created.fold((w) => w, (e) {
        _error = e;
        return null;
      });
      if (workspace == null) return null;

      final refreshed = await _auth.refreshToken();
      return refreshed.fold((s) => s, (e) {
        _error = e;
        return null;
      });
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }
}
