import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<ProviderContainer> openContainer() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await PreferencesService.open();
    final container = ProviderContainer(
      overrides: [preferencesServiceProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('ThemeModeController', () {
    test('defaults to dark when preferences are empty', () async {
      final container = await openContainer();
      expect(container.read(themeModeProvider), ThemeMode.dark);
    });

    test('set() updates the active mode and persists', () async {
      final container = await openContainer();
      await container.read(themeModeProvider.notifier).set(ThemeMode.light);
      expect(container.read(themeModeProvider), ThemeMode.light);
      await container.read(themeModeProvider.notifier).set(ThemeMode.system);
      expect(container.read(themeModeProvider), ThemeMode.system);
    });

    test('next container restored from preferences', () async {
      final first = await openContainer();
      await first.read(themeModeProvider.notifier).set(ThemeMode.light);

      // Open a fresh container against the same shared mock store.
      final prefs = await PreferencesService.open();
      final second = ProviderContainer(
        overrides: [preferencesServiceProvider.overrideWithValue(prefs)],
      );
      addTearDown(second.dispose);
      expect(second.read(themeModeProvider), ThemeMode.light);
    });
  });
}
