import 'dart:convert';

import 'package:flutter/material.dart' show ThemeMode;
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/dto/transaction_settings_dto.dart';
import 'package:oewang/domain/models/transaction_settings.dart';
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
  static const _transactionSettingsKey = 'pref.transaction_settings_json';

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

  TransactionSettings? readTransactionSettings() {
    final raw = _prefs.getString(_transactionSettingsKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final json = jsonDecode(raw);
      if (json is Map<String, dynamic>) {
        return TransactionSettingsDto(json).toDomain();
      }
    } on Exception {
      return null;
    }
    return null;
  }

  Future<void> writeTransactionSettings(TransactionSettings settings) =>
      _prefs.setString(_transactionSettingsKey, jsonEncode(settings.toJson()));
}
