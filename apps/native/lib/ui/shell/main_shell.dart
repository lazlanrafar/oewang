import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/ui/shell/oewang_bottom_nav.dart';
import 'package:oewang/ui/shell/oewang_fab.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';

/// Hosts the 4-tab bottom-nav shell. Each tab is its own [StatefulShellBranch]
/// so back-stacks are preserved per tab.
class MainShell extends ConsumerWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const int _transactionsTabIndex = 0;

  void _onSelect(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  void _onAddTransaction(BuildContext context) {
    context.push(AppRoutes.transactionForm);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = navigationShell.currentIndex;
    final showFab = index == _transactionsTabIndex;
    final month = ref.watch(monthControllerProvider);
    return Scaffold(
      body: navigationShell,
      floatingActionButton: showFab
          ? OewangFab(onPressed: () => _onAddTransaction(context))
          : null,
      bottomNavigationBar: OewangBottomNav(
        currentIndex: index,
        onSelect: _onSelect,
        month: month,
      ),
    );
  }
}
