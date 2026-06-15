import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/ui/shell/oewang_bottom_nav.dart';
import 'package:oewang/ui/shell/oewang_fab.dart';

/// Hosts the 4-tab bottom-nav shell. Each tab is its own [StatefulShellBranch]
/// so back-stacks are preserved per tab.
class MainShell extends StatelessWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const int _settingsTabIndex = 3;

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
  Widget build(BuildContext context) {
    final index = navigationShell.currentIndex;
    final showFab = index != _settingsTabIndex;
    return Scaffold(
      body: navigationShell,
      floatingActionButton: showFab
          ? OewangFab(onPressed: () => _onAddTransaction(context))
          : null,
      bottomNavigationBar: OewangBottomNav(
        currentIndex: index,
        onSelect: _onSelect,
      ),
    );
  }
}
