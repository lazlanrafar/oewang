import 'package:flutter/material.dart' show ThemeMode;
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Typed wrapper around [SharedPreferences] for the small set of user
/// preferences the app persists across restarts.
class PreferencesService {
  PreferencesService(this._prefs);

  static Future<PreferencesService> open() async {
    final prefs = await SharedPreferences.getInstance();
    return PreferencesService(prefs);
  }

  final SharedPreferences _prefs;

  static const _themeModeKey = 'pref.theme_mode';
  static const _transactionColorSchemeKey = 'pref.transaction_color_scheme';

  ThemeMode readThemeMode() {
    final raw = _prefs.getString(_themeModeKey);
    return switch (raw) {
      'light' => ThemeMode.light,
      'system' => ThemeMode.system,
      _ => ThemeMode.dark,
    };
  }

  Future<void> writeThemeMode(ThemeMode mode) async {
    await _prefs.setString(
      _themeModeKey,
      switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.system => 'system',
        ThemeMode.dark => 'dark',
      },
    );
  }

  TransactionColorScheme readTransactionColorScheme() {
    final raw = _prefs.getString(_transactionColorSchemeKey);
    return TransactionColorScheme.fromSetting(raw);
  }

  Future<void> writeTransactionColorScheme(TransactionColorScheme scheme) =>
      _prefs.setString(_transactionColorSchemeKey, scheme.settingValue);
}
