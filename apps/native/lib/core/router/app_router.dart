import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/layouts/main_shell.dart';
import 'package:oewang/components/organisms/auth/auth_login_screen.dart';
import 'package:oewang/components/organisms/auth/auth_onboarding_screen.dart';
import 'package:oewang/components/organisms/auth/auth_register_screen.dart';
import 'package:oewang/components/organisms/budgets/budgets_form_screen.dart';
import 'package:oewang/components/organisms/budgets/budgets_setting_screen.dart';
import 'package:oewang/components/organisms/categories/categories_form_screen.dart';
import 'package:oewang/components/organisms/categories/categories_list_screen.dart';
import 'package:oewang/components/organisms/settings/currency/settings_main_currency_screen.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/settings/style/settings_style_screen.dart';
import 'package:oewang/components/organisms/settings/currency/settings_sub_currency_screen.dart';
import 'package:oewang/components/organisms/settings/transactions/settings_transaction_screen.dart';
import 'package:oewang/components/organisms/stats/stats_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_simple_list_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_settings_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_include_in_totals_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/domain/models/category.dart' as cat;
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';
import 'package:oewang/domain/models/wallet_group.dart';

class AppRoutes {
  const AppRoutes._();

  static const String login = '/login';
  static const String register = '/register';
  static const String onboarding = '/onboarding';
  static const String trans = '/trans';
  static const String stats = '/stats';
  static const String accounts = '/accounts';
  static const String more = '/more';
  static const String transactionForm = '/transactions/new';
  static const String accountForm = '/accounts/new';
  static const String transactionSettings = '/settings/transaction';
  static const String categoriesIncome = '/settings/categories/income';
  static const String categoriesExpense = '/settings/categories/expense';
  static const String categoryAdd = '/settings/categories/add';
  static const String mainCurrency = '/settings/currency/main';
  static const String subCurrency = '/settings/currency/sub';
  static const String style = '/settings/style';
  static const String accountsSettings = '/settings/accounts';
  static const String accountGroup = '/settings/accounts/group';
  static const String accountGroupAdd = '/settings/accounts/group/add';
  static const String accountSimpleList = '/settings/accounts/list';
  static const String includeInTotals = '/settings/accounts/include';
  static const String budgetSettings = '/settings/budget';
  static const String budgetForm = '/settings/budget/add';

  static String accountEditFor(String id) => '/accounts/edit/$id';
  static String budgetEditFor(String id) => '/settings/budget/edit/$id';
  static String categoryEditFor(String id) => '/settings/categories/edit/$id';
  static String accountGroupEditFor(String id) =>
      '/settings/accounts/group/edit/$id';
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
      if (session.isLoading) return null;

      final value = session.valueOrNull;
      final loggedIn = value != null;
      final ws = value?.workspaceId;
      final hasWorkspace = ws != null && ws.isNotEmpty;
      final loc = state.matchedLocation;
      // Public (logged-out) routes. Onboarding is NOT public — it needs a
      // session, so a cleared session there falls back to login instead of
      // stranding the user on a screen whose API calls 401.
      const publicRoutes = {AppRoutes.login, AppRoutes.register};
      const authFlowRoutes = {
        AppRoutes.login,
        AppRoutes.register,
        AppRoutes.onboarding,
      };

      if (!loggedIn) {
        return publicRoutes.contains(loc) ? null : AppRoutes.login;
      }
      // Logged in but no workspace yet → must finish onboarding first.
      if (!hasWorkspace) {
        return loc == AppRoutes.onboarding ? null : AppRoutes.onboarding;
      }
      // Logged in with a workspace → keep them out of the auth flow.
      if (authFlowRoutes.contains(loc)) return AppRoutes.trans;
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.login,
        pageBuilder: (context, state) =>
            const NoTransitionPage(child: LoginScreen()),
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: AppRoutes.transactionForm,
        builder: (context, state) =>
            TransactionFormScreen(transaction: state.extra as Transaction?),
      ),
      GoRoute(
        path: AppRoutes.accountForm,
        builder: (context, state) => const AccountFormScreen(),
      ),
      GoRoute(
        path: '/accounts/edit/:id',
        builder: (context, state) {
          final wallet = state.extra as Wallet?;
          if (wallet == null) {
            return const Scaffold(body: Center(child: Text('Missing account')));
          }
          return AccountFormScreen(wallet: wallet);
        },
      ),
      GoRoute(
        path: AppRoutes.transactionSettings,
        builder: (context, state) => const TransactionSettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.categoriesIncome,
        builder: (context, state) =>
            const CategoryListScreen(type: cat.CategoryType.income),
      ),
      GoRoute(
        path: AppRoutes.categoriesExpense,
        builder: (context, state) =>
            const CategoryListScreen(type: cat.CategoryType.expense),
      ),
      GoRoute(
        path: AppRoutes.categoryAdd,
        builder: (context, state) => CategoryFormScreen(
          createType: state.extra as cat.CategoryType? ?? cat.CategoryType.expense,
        ),
      ),
      GoRoute(
        path: '/settings/categories/edit/:id',
        builder: (context, state) {
          final category = state.extra as cat.Category?;
          if (category == null) {
            return const Scaffold(
              body: Center(child: Text('Missing category')),
            );
          }
          return CategoryFormScreen(category: category);
        },
      ),
      GoRoute(
        path: AppRoutes.mainCurrency,
        builder: (context, state) => const MainCurrencyScreen(),
      ),
      GoRoute(
        path: AppRoutes.subCurrency,
        builder: (context, state) => const SubCurrencyScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountsSettings,
        builder: (context, state) => const AccountsSettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountGroup,
        builder: (context, state) => const AccountGroupScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountGroupAdd,
        builder: (context, state) => const AccountGroupFormScreen(),
      ),
      GoRoute(
        path: '/settings/accounts/group/edit/:id',
        builder: (context, state) {
          final group = state.extra as WalletGroup?;
          if (group == null) {
            return const Scaffold(body: Center(child: Text('Missing group')));
          }
          return AccountGroupFormScreen(group: group);
        },
      ),
      GoRoute(
        path: AppRoutes.accountSimpleList,
        builder: (context, state) => const AccountSimpleListScreen(),
      ),
      GoRoute(
        path: AppRoutes.includeInTotals,
        builder: (context, state) => const IncludeInTotalsScreen(),
      ),
      GoRoute(
        path: AppRoutes.budgetSettings,
        builder: (context, state) => const BudgetSettingScreen(),
      ),
      GoRoute(
        path: AppRoutes.budgetForm,
        builder: (context, state) => const BudgetFormScreen(),
      ),
      GoRoute(
        path: '/settings/budget/edit/:id',
        builder: (context, state) {
          final budget = state.extra as BudgetStatus?;
          if (budget == null) {
            return const Scaffold(body: Center(child: Text('Missing budget')));
          }
          return BudgetFormScreen(budget: budget);
        },
      ),
      GoRoute(
        path: AppRoutes.style,
        builder: (context, state) => const StyleScreen(),
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

final appRouterProvider = Provider<GoRouter>(buildAppRouter);
