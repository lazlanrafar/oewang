import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/layouts/main_shell.dart';
import 'package:oewang/components/organisms/auth/auth_login_screen.dart';
import 'package:oewang/components/organisms/categories/categories_edit_screen.dart';
import 'package:oewang/components/organisms/categories/categories_list_screen.dart';
import 'package:oewang/components/organisms/settings/settings_main_currency_screen.dart';
import 'package:oewang/components/organisms/settings/settings_screen.dart';
import 'package:oewang/components/organisms/settings/settings_style_screen.dart';
import 'package:oewang/components/organisms/settings/settings_sub_currency_screen.dart';
import 'package:oewang/components/organisms/settings/settings_transaction_screen.dart';
import 'package:oewang/components/organisms/stats/stats_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_form_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_group_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_account_simple_list_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_accounts_settings_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_include_in_totals_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_transfer_expense_setting_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/domain/models/category.dart' as cat;
import 'package:oewang/domain/models/transaction.dart';

class AppRoutes {
  const AppRoutes._();

  static const String login = '/login';
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
  static const String accountSimpleList = '/settings/accounts/list';
  static const String includeInTotals = '/settings/accounts/include';
  static const String transferExpense = '/settings/accounts/transfer-expense';

  static String categoryEditFor(String id) => '/settings/categories/edit/$id';
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
        builder: (context, state) => CategoryEditScreen(
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
          return CategoryEditScreen(category: category);
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
        path: AppRoutes.accountSimpleList,
        builder: (context, state) => const AccountSimpleListScreen(),
      ),
      GoRoute(
        path: AppRoutes.includeInTotals,
        builder: (context, state) => const IncludeInTotalsScreen(),
      ),
      GoRoute(
        path: AppRoutes.transferExpense,
        builder: (context, state) => const TransferExpenseSettingScreen(),
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
