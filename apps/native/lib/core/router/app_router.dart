import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/ui/auth/widgets/login_screen.dart';
import 'package:oewang/ui/settings/widgets/settings_screen.dart';
import 'package:oewang/ui/shell/main_shell.dart';
import 'package:oewang/ui/stats/widgets/stats_screen.dart';
import 'package:oewang/ui/transactions/widgets/transactions_screen.dart';
import 'package:oewang/ui/wallets/widgets/wallets_screen.dart';

class AppRoutes {
  const AppRoutes._();

  static const String login = '/login';
  static const String trans = '/trans';
  static const String stats = '/stats';
  static const String accounts = '/accounts';
  static const String more = '/more';
}

/// Re-runs go_router's `redirect` whenever the session value changes.
class _SessionRefresh extends ChangeNotifier {
  _SessionRefresh(Ref ref) {
    _sub = ref.listen(
      sessionControllerProvider,
      (_, _) => notifyListeners(),
    );
  }

  late final ProviderSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}

GoRouter buildAppRouter(Ref ref) {
  final refresh = _SessionRefresh(ref);

  return GoRouter(
    initialLocation: AppRoutes.trans,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionControllerProvider);
      // Wait for bootstrap to resolve before deciding.
      if (session.isLoading) return null;

      final loggedIn = session.valueOrNull != null;
      final goingToLogin = state.matchedLocation == AppRoutes.login;

      if (!loggedIn && !goingToLogin) return AppRoutes.login;
      if (loggedIn && goingToLogin) return AppRoutes.trans;
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.login,
        pageBuilder: (context, state) =>
            const NoTransitionPage(child: LoginScreen()),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.trans,
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: TransactionsScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.stats,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: StatsScreen()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.accounts,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: WalletsScreen()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.more,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: SettingsScreen()),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

/// Provider so tests can override the router with a fake-backed instance.
final appRouterProvider = Provider<GoRouter>(buildAppRouter);
