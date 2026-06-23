import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('PreferencesService', () {
    test('themeMode round-trips through SharedPreferences', () async {
      final service = await PreferencesService.open();
      // Empty store falls back to dark.
      expect(service.readThemeMode(), ThemeMode.dark);
      await service.writeThemeMode(ThemeMode.light);
      expect(service.readThemeMode(), ThemeMode.light);
      await service.writeThemeMode(ThemeMode.system);
      expect(service.readThemeMode(), ThemeMode.system);
    });

    test('transactionColorScheme round-trips through SharedPreferences',
        () async {
      final service = await PreferencesService.open();
      expect(
        service.readTransactionColorScheme(),
        TransactionColorScheme.blueRed,
      );
      await service.writeTransactionColorScheme(
        TransactionColorScheme.redBlue,
      );
      expect(
        service.readTransactionColorScheme(),
        TransactionColorScheme.redBlue,
      );
    });
  });
}
