import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories_fake/auth_repository_fake.dart';
import 'package:oewang/data/repositories_fake/settings_repository_fake.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<ProviderContainer> openContainer({
    required SettingsRepositoryFake settingsRepo,
    AuthRepository? authRepo,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await PreferencesService.open();
    final container = ProviderContainer(
      overrides: [
        preferencesServiceProvider.overrideWithValue(prefs),
        settingsRepositoryProvider.overrideWithValue(settingsRepo),
        // The session controller reads the auth repo on bootstrap, which the
        // color-scheme controller listens to indirectly. Always inject a
        // fake so the dio/api/env chain isn't needed.
        authRepositoryProvider.overrideWithValue(
          authRepo ?? AuthRepositoryFake(),
        ),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('TransactionColorSchemeController hydration', () {
    test('hydrateFromServer pulls the active scheme', () async {
      final settings = SettingsRepositoryFake(
        initial: TransactionColorScheme.redBlue,
      );
      final container = await openContainer(settingsRepo: settings);

      // Local prefs default to blueRed until hydrate.
      expect(
        container.read(transactionColorSchemeProvider),
        TransactionColorScheme.blueRed,
      );

      await container
          .read(transactionColorSchemeProvider.notifier)
          .hydrateFromServer();

      expect(
        container.read(transactionColorSchemeProvider),
        TransactionColorScheme.redBlue,
      );
    });

    test('set() PATCHes the server in addition to local prefs', () async {
      final settings = SettingsRepositoryFake();
      final container = await openContainer(settingsRepo: settings);

      await container
          .read(transactionColorSchemeProvider.notifier)
          .set(TransactionColorScheme.redBlue);

      // Server state should now match.
      final res = await settings.fetchTransactionSettings();
      final s = res.fold((ok) => ok, (_) => null);
      expect(s!.incomeExpensesColor, TransactionColorScheme.redBlue);
    });

    test('logging in WITH a workspace triggers hydrateFromServer', () async {
      final settings = SettingsRepositoryFake(
        initial: TransactionColorScheme.redBlue,
      );
      final container = await openContainer(
        settingsRepo: settings,
        authRepo: AuthRepositoryFake(),
      );
      // Touch the provider so the listener binding inside build() registers.
      container.read(transactionColorSchemeProvider);

      container.read(sessionControllerProvider.notifier).onLoggedIn(
        const Session(token: 't', userId: 'u', workspaceId: 'ws-1'),
      );

      // Let the hydrate microtask settle.
      await Future<void>.delayed(const Duration(milliseconds: 30));

      expect(
        container.read(transactionColorSchemeProvider),
        TransactionColorScheme.redBlue,
      );
    });

    test('logging in WITHOUT a workspace does NOT hydrate', () async {
      // A no-workspace session is mid-onboarding; an authed read would 401 and
      // the 401 handler would clear the session, bouncing the user to login.
      final settings = SettingsRepositoryFake(
        initial: TransactionColorScheme.redBlue,
      );
      final container = await openContainer(
        settingsRepo: settings,
        authRepo: AuthRepositoryFake(),
      );
      container.read(transactionColorSchemeProvider);

      container.read(sessionControllerProvider.notifier).onLoggedIn(
        const Session(token: 't', userId: 'u'),
      );

      await Future<void>.delayed(const Duration(milliseconds: 30));

      // Stays at the local default — no server hydrate fired.
      expect(
        container.read(transactionColorSchemeProvider),
        TransactionColorScheme.blueRed,
      );
    });
  });
}
