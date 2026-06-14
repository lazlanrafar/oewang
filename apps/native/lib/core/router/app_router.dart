import 'package:go_router/go_router.dart';
import 'package:oewang/ui/settings/widgets/settings_screen.dart';
import 'package:oewang/ui/shell/main_shell.dart';
import 'package:oewang/ui/stats/widgets/stats_screen.dart';
import 'package:oewang/ui/transactions/widgets/transactions_screen.dart';
import 'package:oewang/ui/wallets/widgets/wallets_screen.dart';

class AppRoutes {
  const AppRoutes._();

  static const String trans = '/trans';
  static const String stats = '/stats';
  static const String accounts = '/accounts';
  static const String more = '/more';
}

/// Top-level [GoRouter] for the app. Uses [StatefulShellRoute.indexedStack]
/// so each tab maintains an independent navigation history (per Flutter docs
/// recommendation).
GoRouter buildAppRouter() {
  return GoRouter(
    initialLocation: AppRoutes.trans,
    routes: [
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
